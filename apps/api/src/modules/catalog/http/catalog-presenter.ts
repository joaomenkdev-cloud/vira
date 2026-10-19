import { Inject, Injectable } from "@nestjs/common";
import type { CatalogEventDetail, CatalogEventSummary, Money } from "@vira/shared";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { OBJECT_STORAGE, type ObjectStorage } from "../../../platform/storage/object-storage.js";
import {
  available,
  type CatalogEvent,
  type CatalogEventDetail as Detail,
  isSoldOut,
  priceFromCents,
  salesStatus,
} from "../domain/catalog-event.js";

/** How long the picture's signed address in a response works. */
const IMAGE_URL_TTL_SECONDS = 60 * 60;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);
const brl = (amountCents: number): Money => ({ amountCents, currency: "BRL" });

/**
 * The public bodies of the storefront. Counts of sold and reserved tickets stay inside:
 * a buyer sees only how many are left. The picture goes out as a signed address (the
 * bucket is private; signing is local, no call to the storage).
 */
@Injectable()
export class CatalogPresenter {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(event: CatalogEvent): Promise<CatalogEventSummary> {
    return {
      ...(await this.common(event)),
      venue: { name: event.venue.name, city: event.venue.city, state: event.venue.state },
    };
  }

  async detail(event: Detail): Promise<CatalogEventDetail> {
    const now = this.clock.now();
    const common = await this.common(event);
    return {
      ...common,
      descriptionHtml: event.descriptionHtml,
      venue: event.venue,
      image: { ...common.image, credit: event.image.credit },
      organizer: { name: event.organizerName },
      ticketTypes: event.ticketTypes.map((ticketType) => ({
        id: ticketType.id,
        name: ticketType.name,
        description: ticketType.description,
        price: brl(ticketType.priceCents),
        maxPerOrder: ticketType.maxPerOrder,
        available: available(ticketType),
        salesStartAt: isoOrNull(ticketType.salesStartAt),
        salesEndAt: isoOrNull(ticketType.salesEndAt),
        salesStatus: salesStatus(event, ticketType, now),
      })),
    };
  }

  private async common(event: CatalogEvent) {
    const priceFrom = priceFromCents(event);
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      status: event.status,
      startsAt: iso(event.startsAt),
      endsAt: iso(event.endsAt),
      timezone: event.timezone,
      isDemo: event.isDemo,
      priceFrom: priceFrom === null ? null : brl(priceFrom),
      soldOut: isSoldOut(event),
      image: {
        url: await this.storage.presignDownload(event.image.key, IMAGE_URL_TTL_SECONDS),
        alt: event.image.alt,
        width: event.image.width,
        height: event.image.height,
        blurDataUrl: event.image.blurDataUrl,
      },
    };
  }
}
