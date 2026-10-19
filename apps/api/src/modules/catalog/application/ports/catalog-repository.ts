import type { CatalogEvent, CatalogEventDetail } from "../../domain/catalog-event.js";

export const CATALOG_REPOSITORY = Symbol("CATALOG_REPOSITORY");

/** What the storefront list can be narrowed by (docs/API.md#vitrine-catalog--somente-eventos-publicados). */
export interface CatalogFilters {
  /** Part of the title, any case. */
  readonly q?: string;
  /** The venue's city, any case. */
  readonly city?: string;
  /** Starts at or after. */
  readonly from?: Date;
  /** Starts before. */
  readonly to?: Date;
}

/** A place in the list, which is ordered by `startsAt` with `id` breaking ties. */
export interface CatalogPosition {
  readonly startsAt: Date;
  readonly id: string;
}

export interface CatalogListQuery extends CatalogFilters {
  /** Events that ended by then are left out. */
  readonly now: Date;
  readonly after?: CatalogPosition;
  readonly limit: number;
}

/** Read-only access to published events. Drafts are never returned, by any method. */
export interface CatalogRepository {
  /** Published events that have not ended, in order; up to `limit + 1`, to tell if more follow. */
  list(query: CatalogListQuery): Promise<CatalogEvent[]>;
  /**
   * Up to `limit` published events still to start that have a ticket type on sale at
   * `now` (in its sales window, with tickets left), soonest first.
   */
  featured(now: Date, limit: number): Promise<CatalogEvent[]>;
  /** A published or canceled event; `null` for a draft or an unknown slug. */
  findBySlug(slug: string): Promise<CatalogEventDetail | null>;
}
