import { Inject, Injectable } from "@nestjs/common";
import { FEATURED_EVENTS_LIMIT } from "@vira/shared";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import type { CatalogEvent } from "../domain/catalog-event.js";
import { CATALOG_REPOSITORY, type CatalogRepository } from "./ports/catalog-repository.js";

/** The home page highlights: the next events that can be bought right now. */
@Injectable()
export class GetFeaturedEvents {
  constructor(
    @Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<CatalogEvent[]> {
    return this.catalog.featured(this.clock.now(), FEATURED_EVENTS_LIMIT);
  }
}
