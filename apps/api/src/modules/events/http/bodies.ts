import type { OrganizerEvent, OrganizerEventSummary, TicketTypeBody } from "@vira/shared";

import type { EventSummary } from "../application/ports/event-repository.js";
import type { Event, TicketType } from "../domain/event.js";

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

/** What the organizer sees of a ticket type: everything but internal timestamps. */
export function ticketTypeBody(ticketType: TicketType): TicketTypeBody {
  return {
    id: ticketType.id,
    name: ticketType.name,
    description: ticketType.description,
    price: { amountCents: ticketType.priceCents, currency: "BRL" },
    capacity: ticketType.capacity,
    sold: ticketType.sold,
    reserved: ticketType.reserved,
    maxPerOrder: ticketType.maxPerOrder,
    salesStartAt: isoOrNull(ticketType.salesStartAt),
    salesEndAt: isoOrNull(ticketType.salesEndAt),
    sortOrder: ticketType.sortOrder,
  };
}

function commonFields(event: EventSummary | Event) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    status: event.status,
    startsAt: iso(event.startsAt),
    endsAt: iso(event.endsAt),
    timezone: event.timezone,
    venue: event.venue,
    isDemo: event.isDemo,
    createdAt: iso(event.createdAt),
    updatedAt: iso(event.updatedAt),
  };
}

/**
 * The organizer's view of an event. The bucket key of the image is never shown, only a
 * signed address of it (`imageUrl`).
 */
export function eventBody(event: Event, imageUrl: string | null): OrganizerEvent {
  return {
    ...commonFields(event),
    descriptionMd: event.descriptionMd,
    descriptionHtml: event.descriptionHtml,
    image:
      event.image && imageUrl
        ? {
            url: imageUrl,
            alt: event.image.alt ?? "",
            width: event.image.width,
            height: event.image.height,
            blurDataUrl: event.image.blurDataUrl,
          }
        : null,
    publishedAt: isoOrNull(event.publishedAt),
    canceledAt: isoOrNull(event.canceledAt),
    cancelReason: event.cancelReason,
    ticketTypes: event.ticketTypes.map(ticketTypeBody),
  };
}

export function summaryBody(event: EventSummary): OrganizerEventSummary {
  return { ...commonFields(event), ticketTypeCount: event.ticketTypeCount };
}
