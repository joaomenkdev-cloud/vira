import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { Ticket } from "../../domain/ticket.js";

/** A ticket about to be issued. */
export interface NewTicket {
  readonly id: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly eventId: string;
  readonly ticketTypeId: string;
  readonly code: string;
  readonly holderName: string;
  readonly qrNonce: Buffer;
  readonly issuedAt: Date;
}

/** Where a page of tickets starts: after this event start and ticket id. */
export interface TicketCursor {
  readonly startsAt: Date;
  readonly id: string;
}

export interface TicketPage {
  readonly tickets: readonly Ticket[];
  /** Where the next page starts; `undefined` on the last page. */
  readonly next: TicketCursor | undefined;
}

/** What the e-mail with the tickets of an order says. */
export interface IssuedOrder {
  readonly buyerName: string;
  readonly buyerEmail: string;
  readonly publicCode: string;
  readonly event: Pick<
    Ticket["event"],
    "title" | "startsAt" | "timezone" | "venueName" | "venueCity" | "venueState"
  >;
  readonly tickets: readonly {
    readonly code: string;
    readonly holderName: string;
    readonly ticketTypeName: string;
  }[];
}

/**
 * Tickets are always reached through the buyer of their order: a ticket of someone else
 * is simply not found (OWASP API1 — BOLA).
 */
export interface TicketRepository {
  /**
   * Inserts the tickets, skipping any whose code is taken; answers the ids it inserted, so
   * the others can be tried again with new codes.
   */
  insert(tickets: readonly NewTicket[], tx: TransactionContext): Promise<Set<string>>;

  findOwned(ticketId: string, buyerId: string): Promise<Ticket | null>;

  /**
   * The buyer's tickets for events that have not ended at `now` (soonest first), or that
   * have (latest first), `limit` at a time.
   */
  listOwned(
    buyerId: string,
    options: {
      readonly when: "upcoming" | "past";
      readonly now: Date;
      readonly limit: number;
      readonly after?: TicketCursor;
    },
  ): Promise<TicketPage>;

  /** The paid order and its tickets, for the e-mail; `null` when it has none. */
  findIssuedOrder(orderId: string): Promise<IssuedOrder | null>;
}

export const TICKET_REPOSITORY = Symbol("TICKET_REPOSITORY");
