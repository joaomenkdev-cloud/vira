import { Inject, Injectable } from "@nestjs/common";

import type { CatalogEventDetail } from "../domain/catalog-event.js";
import { CatalogEventNotFoundError } from "./errors.js";
import { CATALOG_REPOSITORY, type CatalogRepository } from "./ports/catalog-repository.js";

/**
 * The event page. It also answers for an event that ended or was canceled: buyers keep
 * links to it, and the page says what happened instead of vanishing.
 */
@Injectable()
export class GetPublicEvent {
  constructor(@Inject(CATALOG_REPOSITORY) private readonly catalog: CatalogRepository) {}

  async execute(slug: string): Promise<CatalogEventDetail> {
    const event = await this.catalog.findBySlug(slug);
    if (!event) throw new CatalogEventNotFoundError();
    return event;
  }
}
