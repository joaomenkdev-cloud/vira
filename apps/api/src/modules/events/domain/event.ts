import type { BrazilianState, EventStatus } from "@vira/shared";

/**
 * An event and what it sells, as its organizer manages them (docs/DATA_MODEL.md#events,
 * #ticket_types). "Ended" is not a status: it is derived from `endsAt`.
 */
export interface Event {
  readonly id: string;
  readonly organizerId: string;
  readonly slug: string;
  readonly title: string;
  readonly descriptionMd: string;
  readonly descriptionHtml: string;
  readonly status: EventStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly venue: Venue | null;
  readonly image: EventImage | null;
  readonly isDemo: boolean;
  readonly publishedAt: Date | null;
  readonly canceledAt: Date | null;
  readonly cancelReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** In display order (`sortOrder`, then creation). */
  readonly ticketTypes: readonly TicketType[];
}

export interface Venue {
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly state: BrazilianState;
}

/**
 * The event's picture: re-encoded WebP in the private bucket (N9). `alt` is required to
 * publish; the size and the blurred preview let pages reserve its space before it loads.
 */
export interface EventImage {
  readonly key: string;
  readonly alt: string | null;
  readonly width: number;
  readonly height: number;
  readonly blurDataUrl: string;
}

export interface TicketType {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceCents: number;
  readonly capacity: number;
  readonly sold: number;
  readonly reserved: number;
  readonly maxPerOrder: number;
  readonly salesStartAt: Date | null;
  readonly salesEndAt: Date | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
}

/** Something an event still lacks, named by the request field the organizer must fill. */
export interface MissingRequirement {
  readonly path: string;
  readonly message: string;
}

/**
 * What stands between an event and publication (docs/DATA_MODEL.md#events: "Publicar
 * exige título, data futura, local, imagem com alt, ao menos um tipo de ingresso").
 * The title is always there (the database requires it). A published event must keep
 * meeting these rules, so edits to it are checked against them too.
 */
export function missingForPublication(event: Event, now: Date): MissingRequirement[] {
  const missing: MissingRequirement[] = [];
  if (event.startsAt <= now) {
    missing.push({ path: "startsAt", message: "a data de início precisa estar no futuro" });
  }
  if (!event.venue) missing.push({ path: "venue", message: "informe o local do evento" });
  if (!event.image) {
    missing.push({ path: "image", message: "envie a imagem do evento" });
  } else if (!event.image.alt) {
    missing.push({ path: "image.alt", message: "descreva a imagem (texto alternativo)" });
  }
  if (event.ticketTypes.length === 0) {
    missing.push({ path: "ticketTypes", message: "crie ao menos um tipo de ingresso" });
  }
  return missing;
}

export function hasEnded(event: Pick<Event, "endsAt">, now: Date): boolean {
  return event.endsAt <= now;
}

/**
 * Why the event can no longer be changed (its details or its ticket types), or `null`
 * when it can: a canceled event is final, and an ended one is history.
 */
export function editRefusal(event: Pick<Event, "status" | "endsAt">, now: Date): string | null {
  if (event.status === "CANCELED") return "O evento foi cancelado e não pode mais ser alterado.";
  if (hasEnded(event, now)) return "O evento já terminou e não pode mais ser alterado.";
  return null;
}

/** Tickets already promised to buyers: sold, or held by a pending order. */
export function committed(ticketType: Pick<TicketType, "sold" | "reserved">): number {
  return ticketType.sold + ticketType.reserved;
}
