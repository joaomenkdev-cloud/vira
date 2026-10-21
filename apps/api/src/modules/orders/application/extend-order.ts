import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import type { Order } from "../domain/order.js";
import { extendedExpiry, extensionRefusal } from "../domain/reservation-policy.js";
import type { Caller } from "./buyer.js";
import { OrderNotFoundError, OrderStateError } from "./errors.js";
import { EXPIRATION_SCHEDULER, type ExpirationScheduler } from "./ports/expiration-scheduler.js";
import { ORDER_REPOSITORY, type OrderRepository } from "./ports/order-repository.js";

/**
 * Gives a reservation its single extension of 10 minutes, in its last 2 minutes (WCAG
 * 2.2.1, ADR-0007). The tickets stay held as they are; only the end moves, and a new job
 * is scheduled for it (the old one finds the order not yet due and does nothing).
 */
@Injectable()
export class ExtendOrder {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(EXPIRATION_SCHEDULER) private readonly scheduler: ExpirationScheduler,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * @throws OrderNotFoundError when there is no such order or it is someone else's.
   * @throws OrderStateError when it is not pending, was extended or it is too early.
   */
  async execute(caller: Caller, orderId: string): Promise<Order> {
    const now = this.clock.now();
    const order = await this.findOwned(orderId, caller);
    const refusal = extensionRefusal(order, now);
    if (refusal) throw new OrderStateError(refusal);

    const expiresAt = extendedExpiry(order.expiresAt);
    if (!(await this.orders.extend(order.id, caller.id, order.expiresAt, expiresAt, now))) {
      // A concurrent request (or the expiration) changed it in the meantime.
      const current = await this.findOwned(orderId, caller);
      throw new OrderStateError(
        extensionRefusal(current, now) ?? "Esta reserva mudou. Atualize a página.",
      );
    }
    await this.scheduler.schedule(order.id, expiresAt);
    return this.findOwned(order.id, caller);
  }

  private async findOwned(orderId: string, caller: Caller): Promise<Order> {
    const order = await this.orders.findOwned(orderId, caller.id);
    if (!order) throw new OrderNotFoundError();
    return order;
  }
}
