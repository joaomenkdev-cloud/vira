import { Controller, Get, HttpStatus, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CatalogEventDetail,
  catalogEventDetailSchema,
  type CatalogEventList,
  catalogEventListSchema,
  eventSlugSchema,
  type FeaturedEvents,
  featuredEventsSchema,
  type ListCatalogEventsQuery,
  listCatalogEventsQuerySchema,
  problemDetailsSchema,
} from "@vira/shared";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { CursorCodec } from "../../../platform/pagination/cursor-codec.js";
import { Public } from "../../../platform/security/access-policy.js";
import { CatalogEventNotFoundError } from "../application/errors.js";
import { GetFeaturedEvents } from "../application/get-featured-events.js";
import { GetPublicEvent } from "../application/get-public-event.js";
import { ListCatalogEvents } from "../application/list-catalog-events.js";
import type { CatalogFilters } from "../application/ports/catalog-repository.js";
import { CatalogPresenter } from "./catalog-presenter.js";

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/**
 * The public storefront (docs/API.md#vitrine-catalog--somente-eventos-publicados): only
 * published events, never a draft, and nothing an organizer keeps to themselves.
 */
@ApiTags("Vitrine")
@Public()
@Controller("events")
export class CatalogController {
  constructor(
    private readonly listEvents: ListCatalogEvents,
    private readonly featuredEvents: GetFeaturedEvents,
    private readonly publicEvent: GetPublicEvent,
    private readonly cursors: CursorCodec,
    private readonly presenter: CatalogPresenter,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Lista os eventos publicados",
    description:
      "Os que ainda não terminaram, por data de início (`id` desempata), com paginação " +
      "por cursor. `q` busca no título; `city`, `from` e `to` filtram.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: catalogEventListSchema })
  @problem(HttpStatus.BAD_REQUEST)
  async list(
    @Query({ schema: listCatalogEventsQuerySchema }) query: ListCatalogEventsQuery,
  ): Promise<CatalogEventList> {
    const filters: CatalogFilters = {
      ...(query.q ? { q: query.q } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
    };
    // The cursor is bound to these filters: carried to another search, it is refused.
    const scope = `catalog:${JSON.stringify([
      filters.q?.toLowerCase() ?? null,
      filters.city?.toLowerCase() ?? null,
      filters.from?.toISOString() ?? null,
      filters.to?.toISOString() ?? null,
    ])}`;
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
    const page = await this.listEvents.execute(filters, {
      limit: query.limit,
      ...(after ? { after } : {}),
    });
    return {
      data: await Promise.all(page.events.map((event) => this.presenter.summary(event))),
      page: {
        limit: query.limit,
        nextCursor: page.next
          ? this.cursors.encode(scope, { key: page.next.startsAt.toISOString(), id: page.next.id })
          : null,
      },
    };
  }

  @Get("featured")
  @ApiOperation({
    summary: "Destaques da home",
    description: "Até 6 eventos que ainda vão começar e têm ingresso à venda agora.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: featuredEventsSchema })
  async featured(): Promise<FeaturedEvents> {
    const events = await this.featuredEvents.execute();
    return { data: await Promise.all(events.map((event) => this.presenter.summary(event))) };
  }

  @Get(":slug")
  @ApiOperation({
    summary: "Página do evento",
    description:
      "Evento publicado, inclusive encerrado ou cancelado (`status`), com os tipos de " +
      "ingresso, quantos restam e se estão à venda. Rascunho: `404`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: catalogEventDetailSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.NOT_FOUND)
  async get(@Param("slug", { schema: eventSlugSchema }) slug: string): Promise<CatalogEventDetail> {
    try {
      return await this.presenter.detail(await this.publicEvent.execute(slug));
    } catch (error) {
      if (error instanceof CatalogEventNotFoundError) throw new ProblemException("not-found");
      throw error;
    }
  }
}
