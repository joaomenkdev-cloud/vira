import { Injectable } from "@nestjs/common";

import type { TransactionContext } from "../../../platform/database/transaction.js";

/** A line of a paid order: one ticket is owed per unit. */
export interface PaidOrderLine {
  readonly orderItemId: string;
  readonly ticketTypeId: string;
  readonly quantity: number;
  /** One per ticket, as the buyer gave them before paying. */
  readonly holderNames: readonly string[];
}

/** An order that just became PAID, inside the transaction that made it so. */
export interface PaidOrder {
  readonly orderId: string;
  readonly eventId: string;
  /** The buyer's name as copied into the order; the holder of a line without names. */
  readonly buyerName: string;
  readonly lines: readonly PaidOrderLine[];
}

/** Applies a paid order in the payment's transaction (issues its tickets). */
export type OrderPaidHandler = (order: PaidOrder, tx: TransactionContext) => Promise<void>;

/**
 * Where the module that owns tickets subscribes to orders, so this module never depends on
 * it: the dependency goes one way, from tickets to orders.
 */
@Injectable()
export class OrderEvents {
  private paid: OrderPaidHandler | undefined;

  onOrderPaid(handler: OrderPaidHandler): void {
    if (this.paid) throw new Error("An order paid handler is already registered");
    this.paid = handler;
  }

  /** @throws Error when no module subscribed: an order must never be paid without tickets. */
  async orderPaid(order: PaidOrder, tx: TransactionContext): Promise<void> {
    if (!this.paid) throw new Error("No order paid handler registered");
    await this.paid(order, tx);
  }
}
