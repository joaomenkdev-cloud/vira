import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CancelEventRequest,
  cancelEventRequestSchema,
  type CreateEventRequest,
  createEventRequestSchema,
  type CreateTicketTypeRequest,
  createTicketTypeRequestSchema,
  type ListOrganizerEventsQuery,
  listOrganizerEventsQuerySchema,
  type OrganizerEvent,
  type OrganizerEventList,
  organizerEventListSchema,
  organizerEventSchema,
  problemDetailsSchema,
  resourceIdSchema,
  type TicketTypeBody,
  ticketTypeSchema,
  type UpdateEventRequest,
  updateEventRequestSchema,
} from "@vira/shared";
import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { CursorCodec } from "../../../platform/pagination/cursor-codec.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import { CancelEvent } from "../application/cancel-event.js";
import { CreateEvent } from "../application/create-event.js";
import { CreateTicketType } from "../application/create-ticket-type.js";
import { DeleteDraftEvent } from "../application/delete-draft-event.js";
import { GetOrganizerEvent } from "../application/get-organizer-event.js";
import { ListOrganizerEvents } from "../application/list-organizer-events.js";
import type { RequestContext } from "../application/organizer-scope.js";
import { PublishEvent } from "../application/publish-event.js";
import { UpdateEvent } from "../application/update-event.js";
import { summaryBody, ticketTypeBody } from "./bodies.js";
import { EventPresenter } from "./event-presenter.js";
import { asProblem } from "./problems.js";

export function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

export function contextOf(request: Request): RequestContext {
  return typeof request.id === "string" ? { requestId: request.id } : {};
}

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/**
 * The organizer's side of events (docs/API.md#eventos-do-organizador-events). Every
 * route acts only on the caller's own events: one of someone else's answers `404`,
 * exactly like one that does not exist (OWASP API1 — BOLA). The ownership check is in
 * the use cases, which never look an event up without its organizer.
 */
@ApiTags("Eventos do organizador")
@RequireRole("ORGANIZER")
@Controller("organizer/events")
export class OrganizerEventsController {
  constructor(
    private readonly listEvents: ListOrganizerEvents,
    private readonly createEvent: CreateEvent,
    private readonly getEvent: GetOrganizerEvent,
    private readonly updateEvent: UpdateEvent,
    private readonly deleteEvent: DeleteDraftEvent,
    private readonly publishEvent: PublishEvent,
    private readonly cancelEvent: CancelEvent,
    private readonly createTicketType: CreateTicketType,
    private readonly cursors: CursorCodec,
    private readonly presenter: EventPresenter,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Lista os próprios eventos",
    description: "Mais novos primeiro, com paginação por cursor; `status` filtra.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: organizerEventListSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  async list(
    @Query({ schema: listOrganizerEventsQuerySchema }) query: ListOrganizerEventsQuery,
    @Req() request: Request,
  ): Promise<OrganizerEventList> {
    const caller = callerOf(request);
    // The cursor is bound to this caller and this filter: it means nothing elsewhere.
    const scope = `organizer-events:${caller.id}:${query.status ?? "*"}`;
    let after: { createdAt: Date; id: string } | undefined;
    if (query.cursor !== undefined) {
      const position = this.cursors.decode(scope, query.cursor);
      if (!position) {
        throw new ProblemException("validation-failed", {
          errors: [{ path: "cursor", message: "cursor inválido" }],
        });
      }
      after = { createdAt: new Date(position.key), id: position.id };
    }
    const page = await asProblem(() =>
      this.listEvents.execute(caller, {
        limit: query.limit,
        ...(query.status ? { status: query.status } : {}),
        ...(after ? { after } : {}),
      }),
    );
    return {
      data: page.events.map(summaryBody),
      page: {
        limit: query.limit,
        nextCursor: page.next
          ? this.cursors.encode(scope, { key: page.next.createdAt.toISOString(), id: page.next.id })
          : null,
      },
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Cria um rascunho",
    description:
      "O rascunho pode ficar sem local, imagem e tipos de ingresso; tudo isso é exigido " +
      "ao publicar. A descrição em markdown vira HTML sanitizado no servidor.",
  })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: organizerEventSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.TOO_MANY_REQUESTS)
  async create(
    @Body({ schema: createEventRequestSchema }) body: CreateEventRequest,
    @Req() request: Request,
  ): Promise<OrganizerEvent> {
    return this.presenter.event(
      await asProblem(() => this.createEvent.execute(callerOf(request), body)),
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Mostra um dos próprios eventos, com os tipos de ingresso" })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: organizerEventSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  async get(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<OrganizerEvent> {
    return this.presenter.event(
      await asProblem(() => this.getEvent.execute(callerOf(request), id)),
    );
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Edita os dados do evento",
    description:
      "Campos parciais; `venue: null` remove o local. Um evento publicado precisa continuar " +
      "completo (`409` com a lista do que faltaria); cancelado ou encerrado não muda mais.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: organizerEventSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async update(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Body({ schema: updateEventRequestSchema }) body: UpdateEventRequest,
    @Req() request: Request,
  ): Promise<OrganizerEvent> {
    return this.presenter.event(
      await asProblem(() => this.updateEvent.execute(callerOf(request), id, body)),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Exclui um rascunho", description: "Evento publicado: `409`." })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async remove(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await asProblem(() => this.deleteEvent.execute(callerOf(request), id));
  }

  @Post(":id/publish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Publica o rascunho",
    description:
      "Exige data futura, local, imagem com texto alternativo e ao menos um tipo de " +
      "ingresso. Faltando algo: `409` `invalid-state-transition`, com o que falta em `errors`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: organizerEventSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async publish(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<OrganizerEvent> {
    return this.presenter.event(
      await asProblem(() => this.publishEvent.execute(callerOf(request), id, contextOf(request))),
    );
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancela um evento publicado",
    description: "Definitivo. Um rascunho não é cancelado, é excluído (`409`).",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: organizerEventSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async cancel(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Body({ schema: cancelEventRequestSchema }) body: CancelEventRequest,
    @Req() request: Request,
  ): Promise<OrganizerEvent> {
    return this.presenter.event(
      await asProblem(() =>
        this.cancelEvent.execute(callerOf(request), id, body, contextOf(request)),
      ),
    );
  }

  @Post(":id/ticket-types")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Cria um tipo de ingresso no evento" })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: ticketTypeSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async addTicketType(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Body({ schema: createTicketTypeRequestSchema }) body: CreateTicketTypeRequest,
    @Req() request: Request,
  ): Promise<TicketTypeBody> {
    return ticketTypeBody(
      await asProblem(() => this.createTicketType.execute(callerOf(request), id, body)),
    );
  }
}
