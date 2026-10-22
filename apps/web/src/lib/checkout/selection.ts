import type { CatalogEventDetail, PublicTicketType } from "@vira/shared";

/**
 * What the buyer picked on the event page: one ticket type and how many (docs/DESIGN.md,
 * 4.2). It travels in the address (`?ingresso=<id>&quantidade=2`), so signing in or
 * coming back from an expired reservation finds the same choice.
 */
export interface Selection {
  ticketTypeId: string;
  quantity: number;
}

export const SELECTION_PARAMS = { ticketType: "ingresso", quantity: "quantidade" } as const;

/** The most of a type one order can take: its own limit, or what is left of it. */
export function maxQuantity(ticketType: PublicTicketType): number {
  return Math.max(0, Math.min(ticketType.maxPerOrder, ticketType.available));
}

export function isSelectable(ticketType: PublicTicketType): boolean {
  return ticketType.salesStatus === "ON_SALE" && maxQuantity(ticketType) > 0;
}

/**
 * The selection the address carries, if it still makes sense for the event: a type on
 * sale, and a quantity within what can be bought (a stale or edited link is corrected,
 * never trusted; the API checks again anyway).
 */
export function selectionFrom(
  params: Readonly<Record<string, string | string[] | undefined>>,
  event: Pick<CatalogEventDetail, "ticketTypes">,
): Selection | null {
  const id = params[SELECTION_PARAMS.ticketType];
  const ticketType = event.ticketTypes.find((type) => type.id === id);
  if (!ticketType || !isSelectable(ticketType)) return null;
  const raw = params[SELECTION_PARAMS.quantity];
  const asked = typeof raw === "string" && /^\d{1,3}$/.test(raw) ? Number(raw) : 1;
  return {
    ticketTypeId: ticketType.id,
    quantity: Math.min(Math.max(asked, 1), maxQuantity(ticketType)),
  };
}

/** The event page's address with the selection in it, anchored at the ticket picker. */
export function eventPathWith(slug: string, selection: Selection | null): string {
  const path = `/eventos/${encodeURIComponent(slug)}`;
  if (!selection) return `${path}#ingressos`;
  const query = new URLSearchParams({
    [SELECTION_PARAMS.ticketType]: selection.ticketTypeId,
    [SELECTION_PARAMS.quantity]: String(selection.quantity),
  });
  return `${path}?${query.toString()}#ingressos`;
}
