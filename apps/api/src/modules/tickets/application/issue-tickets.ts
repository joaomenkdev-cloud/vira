import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import type { PaidOrder } from "../../orders/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { newTicketCode } from "../domain/ticket-code.js";
import {
  type NewTicket,
  TICKET_REPOSITORY,
  type TicketRepository,
} from "./ports/ticket-repository.js";

/** Attempts at codes that are all free; with 40-bit codes a second one is already rare. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Issues one ticket per unit of a paid order, in the transaction that marked it PAID
 * (V5): a paid order always has its tickets, and a rolled-back payment has none. Each
 * ticket gets a random code and QR nonce; the buyer is told by e-mail through the outbox.
 */
@Injectable()
export class IssueTickets {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly outbox: Outbox,
  ) {}

  async execute(order: PaidOrder, tx: TransactionContext): Promise<void> {
    const issuedAt = this.clock.now();
    let pending: NewTicket[] = order.lines.flatMap((line) =>
      Array.from({ length: line.quantity }, (_, index) => ({
        id: this.ids.next(),
        orderId: order.orderId,
        orderItemId: line.orderItemId,
        eventId: order.eventId,
        ticketTypeId: line.ticketTypeId,
        code: newTicketCode(),
        // Named by the buyer before paying (V6); a line without names is the buyer's own.
        holderName: line.holderNames[index] ?? order.buyerName,
        qrNonce: randomBytes(16),
        issuedAt,
      })),
    );
    for (let attempt = 1; pending.length > 0; attempt++) {
      if (attempt > MAX_CODE_ATTEMPTS) throw new Error("Could not find free ticket codes");
      const inserted = await this.tickets.insert(pending, tx);
      // A code already taken (by another order, or twice in this batch): draw another.
      pending = pending
        .filter((ticket) => !inserted.has(ticket.id))
        .map((ticket) => ({ ...ticket, code: newTicketCode() }));
    }
    await this.outbox.publish({ type: "tickets.issued", payload: { orderId: order.orderId } }, tx);
  }
}
