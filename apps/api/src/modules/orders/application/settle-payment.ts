import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import type { AfterCommit, SucceededPayment } from "../../payments/application/public-api.js";
import { OrderEvents } from "./order-events.js";
import { byTicketTypeId } from "./order-expiry.js";
import { INVENTORY, type Inventory } from "./ports/inventory.js";
import {
  type HeldTickets,
  ORDER_REPOSITORY,
  type OrderRepository,
  type PayableOrder,
} from "./ports/order-repository.js";

/**
 * Applies a payment Stripe confirmed (V4, ADR-0006), in the webhook's transaction: the only
 * way an order becomes PAID. The order row is locked first, so the expiration and the buyer
 * canceling wait for it, or it sees what they did:
 *
 * - PENDING → PAID: the held tickets become sold, and the tickets are issued.
 * - EXPIRED (a late payment): the tickets are sold again if they are still there → PAID;
 *   otherwise → REFUNDED, and a job refunds the payment.
 * - CANCELED (paid after giving up) → REFUNDED, refunded by the same job.
 * - Already PAID or REFUNDED, or a payment that does not match the order: nothing.
 */
@Injectable()
export class SettlePayment {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INVENTORY) private readonly inventory: Inventory,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly outbox: Outbox,
    private readonly audit: AuditLog,
    private readonly events: OrderEvents,
    @InjectPinoLogger(SettlePayment.name) private readonly logger: PinoLogger,
  ) {}

  async execute(
    payment: SucceededPayment,
    tx: TransactionContext,
  ): Promise<AfterCommit | undefined> {
    const order = await this.orders.findForPayment(payment.orderId, tx);
    // The PaymentIntent must be the order's own, for its whole total (SECURITY_MODEL, S).
    if (
      order?.paymentIntentId !== payment.paymentIntentId ||
      order.totalCents !== payment.amountCents
    ) {
      return () => {
        this.logger.warn(
          { orderId: payment.orderId, paymentIntentId: payment.paymentIntentId },
          "Payment that does not match its order ignored",
        );
        return Promise.resolve();
      };
    }

    const now = this.clock.now();
    switch (order.status) {
      case "PENDING":
        return this.pay(order, false, now, tx);
      case "EXPIRED":
        return (await this.sellAgain(order.items, tx))
          ? this.pay(order, true, now, tx)
          : this.refund(order, now, tx);
      case "CANCELED":
        return this.refund(order, now, tx);
      case "PAID":
      case "REFUNDED":
        return undefined;
    }
  }

  private async pay(
    order: PayableOrder,
    late: boolean,
    now: Date,
    tx: TransactionContext,
  ): Promise<AfterCommit | undefined> {
    if (!(await this.orders.markPaid(order.id, now, tx))) return undefined;
    // A late payment already sold its tickets again; an on-time one still holds them.
    if (!late) {
      for (const item of [...order.items].sort(byTicketTypeId)) {
        await this.inventory.sell(item.ticketTypeId, item.quantity, tx);
      }
    }
    // The tickets are issued in this same transaction (V5): a paid order always has them.
    await this.events.orderPaid(
      {
        orderId: order.id,
        eventId: order.eventId,
        buyerName: order.buyerName,
        lines: order.items.map((item) => ({
          orderItemId: item.id,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          holderNames: item.holderNames,
        })),
      },
      tx,
    );
    const paymentIntentId = order.paymentIntentId ?? "";
    return () =>
      this.audit.record(
        {
          action: "order.paid",
          entityId: order.id,
          metadata: { totalCents: order.totalCents, paymentIntentId, late },
        },
        { actor: "system" },
      );
  }

  private async refund(
    order: PayableOrder,
    now: Date,
    tx: TransactionContext,
  ): Promise<AfterCommit | undefined> {
    if (!order.paymentIntentId || !(await this.orders.markRefunded(order.id, now, tx))) {
      return undefined;
    }
    await this.outbox.publish(
      {
        type: "orders.refund_requested",
        payload: { orderId: order.id, paymentIntentId: order.paymentIntentId },
      },
      tx,
    );
    return () =>
      this.audit.record(
        {
          action: "order.refunded",
          entityId: order.id,
          metadata: { reason: "late_payment", totalCents: order.totalCents },
        },
        { actor: "system" },
      );
  }

  /** Sells every line again, or none: a line that falls short undoes the ones before it. */
  private async sellAgain(items: readonly HeldTickets[], tx: TransactionContext): Promise<boolean> {
    const sold: HeldTickets[] = [];
    for (const item of [...items].sort(byTicketTypeId)) {
      if (!(await this.inventory.sellUnheld(item.ticketTypeId, item.quantity, tx))) {
        for (const done of sold) await this.inventory.unsell(done.ticketTypeId, done.quantity, tx);
        return false;
      }
      sold.push(item);
    }
    return true;
  }
}
