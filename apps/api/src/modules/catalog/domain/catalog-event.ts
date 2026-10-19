import type { BrazilianState, SalesStatus } from "@vira/shared";

/**
 * A published (or canceled) event as the public sees it: no organizer-only fields
 * (`descriptionMd`, `sold`, `reserved`, the cancel reason), read straight from the
 * `events` tables (docs/ARCHITECTURE.md: `catalog` reads projections of `events`).
 */
export interface CatalogEvent {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: "PUBLISHED" | "CANCELED";
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly venue: CatalogVenue;
  readonly image: CatalogImage;
  readonly isDemo: boolean;
  /** In display order. */
  readonly ticketTypes: readonly CatalogTicketType[];
}

/** The event page: the summary plus what only the page shows. */
export interface CatalogEventDetail extends CatalogEvent {
  readonly descriptionHtml: string;
  readonly organizerName: string;
}

export interface CatalogVenue {
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly state: BrazilianState;
}

export interface CatalogImage {
  readonly key: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly blurDataUrl: string;
  /** Free-licensed photos of the demo events carry their credit (ADR-0010). */
  readonly credit: ImageCredit | null;
}

export interface ImageCredit {
  readonly author: string;
  readonly url: string;
  readonly license: string;
}

export interface CatalogTicketType {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceCents: number;
  readonly capacity: number;
  readonly sold: number;
  readonly reserved: number;
  readonly maxPerOrder: number;
  readonly salesStartAt: Date | null;
  readonly salesEndAt: Date | null;
}

/** Tickets still left: neither sold nor held by a pending order. */
export function available(ticketType: CatalogTicketType): number {
  return Math.max(0, ticketType.capacity - ticketType.sold - ticketType.reserved);
}

/**
 * Where a ticket type stands for a buyer at `now`. Without an end of its own, sales
 * last until the event ends; a canceled event sells nothing.
 */
export function salesStatus(
  event: Pick<CatalogEvent, "status" | "endsAt">,
  ticketType: CatalogTicketType,
  now: Date,
): SalesStatus {
  if (event.status !== "PUBLISHED" || now >= (ticketType.salesEndAt ?? event.endsAt)) {
    return "CLOSED";
  }
  if (ticketType.salesStartAt && now < ticketType.salesStartAt) return "NOT_STARTED";
  if (available(ticketType) === 0) return "SOLD_OUT";
  return "ON_SALE";
}

/** The cheapest ticket still left, in cents, or `null` when none is. */
export function priceFromCents(event: Pick<CatalogEvent, "ticketTypes">): number | null {
  const left = event.ticketTypes.filter((ticketType) => available(ticketType) > 0);
  if (left.length === 0) return null;
  return Math.min(...left.map((ticketType) => ticketType.priceCents));
}

/** Every ticket type is gone. An event with no ticket types is not "sold out". */
export function isSoldOut(event: Pick<CatalogEvent, "ticketTypes">): boolean {
  return (
    event.ticketTypes.length > 0 &&
    event.ticketTypes.every((ticketType) => available(ticketType) === 0)
  );
}
