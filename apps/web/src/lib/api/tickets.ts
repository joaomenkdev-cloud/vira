import type { CatalogEventDetail, TicketBody, TicketListBody } from "@vira/shared";

import { api } from "./browser";

/*
 * The buyer's tickets (docs/API.md, "Ingressos"). A ticket of someone else answers 404,
 * exactly as one that does not exist.
 */

export type TicketsWhen = "upcoming" | "past";

export function listTickets(when: TicketsWhen, cursor?: string): Promise<TicketListBody> {
  const query = new URLSearchParams({ when, limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return api.request(`/tickets?${query.toString()}`);
}

/** One ticket with its QR token: never cached (the API answers `no-store`). */
export function getTicket(id: string): Promise<TicketBody> {
  return api.request(`/tickets/${encodeURIComponent(id)}`);
}

/** The event's public page data (photo, address, "Demonstração"), for the ticket. */
export function getPublicEvent(slug: string): Promise<CatalogEventDetail> {
  return api.request(`/events/${encodeURIComponent(slug)}`, { refresh: false });
}
