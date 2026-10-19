import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import type { CatalogEvent } from "../domain/catalog-event.js";
import {
  CATALOG_REPOSITORY,
  type CatalogFilters,
  type CatalogPosition,
  type CatalogRepository,
} from "./ports/catalog-repository.js";

export interface CatalogPage {
  readonly events: readonly CatalogEvent[];
  /** Where the next page starts, or `null` on the last one. */
  readonly next: CatalogPosition | null;
}

/** The storefront: published events that have not ended, soonest first, a page at a time. */
@Injectable()
export class ListCatalogEvents {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    filters: CatalogFilters,
    page: { readonly after?: CatalogPosition; readonly limit: number },
  ): Promise<CatalogPage> {
    const rows = await this.catalog.list({ ...filters, ...page, now: this.clock.now() });
    const events = rows.slice(0, page.limit);
    const last = events.at(-1);
    return {
      events,
      next: rows.length > page.limit && last ? { startsAt: last.startsAt, id: last.id } : null,
    };
  }
}
