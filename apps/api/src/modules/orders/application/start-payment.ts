import { Inject, Injectable } from "@nestjs/common";

import {
  RATE_LIMITER,
  type RateLimiter,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { PaymentIntents, type PaymentSession } from "../../payments/application/public-api.js";
import type { Caller } from "./buyer.js";
import { OrderNotFoundError, OrderStateError } from "./errors.js";
import { ORDER_REPOSITORY, type OrderRepository } from "./ports/order-repository.js";
import { ORDERS_RATE_LIMITS } from "./rate-limits.js";

/**
 * Lets the buyer pay a pending order (V3, ADR-0006): the order's PaymentIntent, created on
 * the first call with the total stored in the order, never a value from the request.
 * Calling again answers the same PaymentIntent. Paying does not mark the order as paid:
 * only Stripe's signed webhook does (V4).
 */
@Injectable()
export class StartPayment {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly payments: PaymentIntents,
  ) {}

  /**
   * @throws RateLimitExceededError past the account's budget.
   * @throws OrderNotFoundError when there is no such order or it is someone else's.
   * @throws OrderStateError when it is not pending, or its reservation is over.
   * @throws PaymentsUnavailableError or PaymentGatewayError when Stripe cannot be used.
   */
  async execute(caller: Caller, orderId: string): Promise<PaymentSession> {
    const budget = await this.limiter.hit(ORDERS_RATE_LIMITS.paymentAccount, caller.id);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const order = await this.orders.findOwned(orderId, caller.id);
    if (!order) throw new OrderNotFoundError();
    if (order.status !== "PENDING" || this.clock.now() >= order.expiresAt) {
      throw new OrderStateError("Esta reserva não está mais em andamento.");
    }

    const session = await this.payments.open({
      orderId: order.id,
      amountCents: order.totalCents,
      paymentIntentId: order.paymentIntentId,
    });
    if (!order.paymentIntentId) {
      await this.orders.attachPaymentIntent(order.id, session.paymentIntentId);
    }
    return session;
  }
}
