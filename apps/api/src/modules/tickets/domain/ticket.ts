import type { TicketStatus } from "@vira/shared";

/** The event a ticket is for, as the ticket shows it. */
export interface TicketEvent {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly venueName: string | null;
  readonly venueCity: string | null;
  readonly venueState: string | null;
}

/** A ticket as its owner sees it (docs/DATA_MODEL.md#tickets). */
export interface Ticket {
  readonly id: string;
  readonly orderId: string;
  readonly code: string;
  readonly status: TicketStatus;
  readonly holderName: string;
  readonly ticketTypeName: string;
  readonly event: TicketEvent;
  readonly issuedAt: Date;
  readonly usedAt: Date | null;
  /** Inside the QR token; never shown as such. */
  readonly qrNonce: Buffer;
}
