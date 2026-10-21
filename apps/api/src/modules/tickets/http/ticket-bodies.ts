import type { TicketBody, TicketSummaryBody } from "@vira/shared";

import type { Ticket } from "../domain/ticket.js";

export function ticketSummaryBody(ticket: Ticket): TicketSummaryBody {
  return {
    id: ticket.id,
    code: ticket.code,
    status: ticket.status,
    holderName: ticket.holderName,
    ticketType: { name: ticket.ticketTypeName },
    event: {
      id: ticket.event.id,
      slug: ticket.event.slug,
      title: ticket.event.title,
      startsAt: ticket.event.startsAt.toISOString(),
      endsAt: ticket.event.endsAt.toISOString(),
      timezone: ticket.event.timezone,
      venueName: ticket.event.venueName,
      venueCity: ticket.event.venueCity,
      venueState: ticket.event.venueState,
    },
    orderId: ticket.orderId,
    issuedAt: ticket.issuedAt.toISOString(),
    usedAt: ticket.usedAt?.toISOString() ?? null,
  };
}

export function ticketBody(ticket: Ticket, qrToken: string): TicketBody {
  return { ...ticketSummaryBody(ticket), qrToken };
}
