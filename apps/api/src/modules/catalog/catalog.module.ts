import { Module } from "@nestjs/common";

import { GetFeaturedEvents } from "./application/get-featured-events.js";
import { GetPublicEvent } from "./application/get-public-event.js";
import { ListCatalogEvents } from "./application/list-catalog-events.js";
import { CATALOG_REPOSITORY } from "./application/ports/catalog-repository.js";
import { CatalogPresenter } from "./http/catalog-presenter.js";
import { CatalogController } from "./http/catalog.controller.js";
import { PrismaCatalogRepository } from "./infra/prisma-catalog-repository.js";

/** The public side of events: the storefront list, the highlights and the event page (N10). */
@Module({
  controllers: [CatalogController],
  providers: [
    ListCatalogEvents,
    GetFeaturedEvents,
    GetPublicEvent,
    CatalogPresenter,
    { provide: CATALOG_REPOSITORY, useClass: PrismaCatalogRepository },
  ],
})
export class CatalogModule {}
