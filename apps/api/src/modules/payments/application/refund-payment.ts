import { Inject, Injectable } from "@nestjs/common";

import { PAYMENT_GATEWAY, type PaymentGateway } from "./ports/payment-gateway.js";

/**
 * Gives back a payment that could not be honoured (a late payment with no tickets left, or
 * one that arrived after the buyer canceled). Run by the `payments` queue, which retries it;
 * the idempotency key `refund:{orderId}` keeps the retries from refunding twice.
 */
@Injectable()
export class RefundPayment {
  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}

  async execute(orderId: string, paymentIntentId: string): Promise<void> {
    await this.gateway.refundPaymentIntent(paymentIntentId, `refund:${orderId}`);
  }
}
