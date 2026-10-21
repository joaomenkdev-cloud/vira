import { Inject, Injectable } from "@nestjs/common";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import type { Order } from "../domain/order.js";
import { auditContext, type Caller, type RequestContext } from "./buyer.js";
import { OrderNotFoundError, OrderStateError } from "./errors.js";
import { releaseHeld } from "./order-expiry.js";
import { INVENTORY, type Inventory } from "./ports/inventory.js";
import { ORDER_REPOSITORY, type OrderRepository } from "./ports/order-repository.js";

const CANNOT_CANCEL: Partial<Record<Order["status"], string>> = {
  PAID: "Este pedido já foi pago.",
  EXPIRED: "Esta reserva já expirou e os ingressos foram liberados.",
  REFUNDED: "Este pedido foi reembolsado.",
};

/**
 * The buyer gives up a pending order before its time is up: PENDING → CANCELED, with the
 * tickets back in the same transaction. Asking again answers the canceled order, so a
 * retried request is harmless.
 */
@Injectable()
export class CancelOrder {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INVENTORY) private readonly inventory: Inventory,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws OrderNotFoundError when there is no such order or it is someone else's.
   * @throws OrderStateError when it was paid, expired or refunded.
   */
  async execute(caller: Caller, orderId: string, context: RequestContext = {}): Promise<Order> {
    const now = this.clock.now();
    const canceled = await this.transactions.run(async (tx) => {
      const held = await this.orders.markCanceled(orderId, caller.id, now, tx);
      if (!held) return false;
      await releaseHeld(this.inventory, held, tx);
      return true;
    });

    const order = await this.orders.findOwned(orderId, caller.id);
    if (!order) throw new OrderNotFoundError();
    if (canceled) {
      await this.audit.record(
        { action: "order.canceled", entityId: order.id, metadata: {} },
        auditContext(caller, context),
      );
    } else if (order.status !== "CANCELED") {
      throw new OrderStateError(
        CANNOT_CANCEL[order.status] ?? "Este pedido não pode ser cancelado.",
      );
    }
    return order;
  }
}
