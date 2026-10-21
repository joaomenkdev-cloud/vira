import { RESERVATION_MINUTES } from "@vira/shared";

/** When a reservation made at `now` lets its tickets go (ADR-0007). */
export function reservationExpiry(now: Date): Date {
  return new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
}

/** What the sale rules need to know about an event. Drafts never get this far. */
export interface SaleEvent {
  readonly id: string;
  readonly status: "PUBLISHED" | "CANCELED";
  readonly endsAt: Date;
  readonly ticketTypes: readonly SaleTicketType[];
}

export interface SaleTicketType {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly maxPerOrder: number;
  readonly salesStartAt: Date | null;
  readonly salesEndAt: Date | null;
}

/** Why the event sells nothing at `now`, or `null` while it is on sale. */
export function eventSalesRefusal(event: SaleEvent, now: Date): string | null {
  if (event.status === "CANCELED") return "Este evento foi cancelado.";
  if (now >= event.endsAt) return "Este evento já terminou.";
  return null;
}

/**
 * Why a ticket type is not on sale at `now`, or `null` while it is. Without an end of its
 * own, sales last until the event ends (the same rule the storefront shows).
 */
export function ticketTypeSalesRefusal(
  event: SaleEvent,
  ticketType: SaleTicketType,
  now: Date,
): string | null {
  if (ticketType.salesStartAt && now < ticketType.salesStartAt) {
    return `As vendas de "${ticketType.name}" ainda não começaram.`;
  }
  if (now >= (ticketType.salesEndAt ?? event.endsAt)) {
    return `As vendas de "${ticketType.name}" estão encerradas.`;
  }
  return null;
}
