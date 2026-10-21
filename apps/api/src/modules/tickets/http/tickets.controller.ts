import { Controller, Get, Header, HttpStatus, Param, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type ListTicketsQuery,
  listTicketsQuerySchema,
  problemDetailsSchema,
  resourceIdSchema,
  type TicketBody,
  type TicketListBody,
  ticketListSchema,
  ticketSchema,
} from "@vira/shared";
import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { CursorCodec } from "../../../platform/pagination/cursor-codec.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import { TicketNotFoundError } from "../application/errors.js";
import { GetTicket } from "../application/get-ticket.js";
import { ListTickets } from "../application/list-tickets.js";
import { ticketBody, ticketSummaryBody } from "./ticket-bodies.js";

function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/**
 * The buyer's tickets (docs/API.md#ingressos-tickets). Only tickets of the caller's own
 * orders: one of someone else answers `404`, exactly like one that does not exist.
 */
@ApiTags("Ingressos")
@RequireRole("BUYER")
@Controller("tickets")
export class TicketsController {
  constructor(
    private readonly listTickets: ListTickets,
    private readonly getTicket: GetTicket,
    private readonly cursors: CursorCodec,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Os ingressos do próprio comprador",
    description:
      "Eventos que ainda não terminaram (`upcoming`, os mais próximos primeiro) ou que já " +
      "terminaram (`past`, os mais recentes primeiro), com paginação por cursor. Sem o QR.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: ticketListSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  async list(
    @Query({ schema: listTicketsQuerySchema }) query: ListTicketsQuery,
    @Req() request: Request,
  ): Promise<TicketListBody> {
    const caller = callerOf(request);
    // The cursor is bound to the buyer and the filter: carried elsewhere, it is refused.
    const scope = `tickets:${caller.id}:${query.when}`;
    let after: { startsAt: Date; id: string } | undefined;
    if (query.cursor !== undefined) {
      const position = this.cursors.decode(scope, query.cursor);
      if (!position) {
        throw new ProblemException("validation-failed", {
          errors: [{ path: "cursor", message: "cursor inválido" }],
        });
      }
      after = { startsAt: new Date(position.key), id: position.id };
    }
    const page = await this.listTickets.execute(caller, {
      when: query.when,
      limit: query.limit,
      ...(after ? { after } : {}),
    });
    return {
      data: page.tickets.map(ticketSummaryBody),
      page: {
        limit: query.limit,
        nextCursor: page.next
          ? this.cursors.encode(scope, { key: page.next.startsAt.toISOString(), id: page.next.id })
          : null,
      },
    };
  }

  @Get(":id")
  // The QR token is a credential to enter the event: no cache may keep it.
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Um ingresso do próprio comprador, com o token do QR Code",
    description: "O `qrToken` é o conteúdo do QR Code (ADR-0008) e só aparece aqui, para o dono.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: ticketSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  async get(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<TicketBody> {
    try {
      const { ticket, qrToken } = await this.getTicket.execute(callerOf(request), id);
      return ticketBody(ticket, qrToken);
    } catch (error) {
      if (error instanceof TicketNotFoundError) throw new ProblemException("not-found");
      throw error;
    }
  }
}
