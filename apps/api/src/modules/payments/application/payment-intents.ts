import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { PAYMENT_GATEWAY, type PaymentGateway } from "./ports/payment-gateway.js";

/** What the browser needs to show the Payment Element for one order. */
export interface PaymentSession {
  readonly paymentIntentId: string;
  readonly clientSecret: string;
  readonly publishableKey: string;
}

export interface PaymentRequest {
  readonly orderId: string;
  /** Read from the order in the database, never from the request. */
  readonly amountCents: number;
  /** The PaymentIntent the order already has, if any. */
  readonly paymentIntentId: string | null;
}

/** Payments are off: no Stripe keys in this environment (development, tests). */
export class PaymentsUnavailableError extends Error {
  constructor() {
    super("Payments are not configured");
    this.name = "PaymentsUnavailableError";
  }
}

/**
 * Opens the payment of an order (V3, ADR-0006): one PaymentIntent per order, ever. The
 * Stripe idempotency key `pi:{orderId}` makes concurrent or retried calls answer the same
 * one, and an order that already has one gets it back instead of a new one.
 */
@Injectable()
export class PaymentIntents {
  constructor(
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * @throws PaymentsUnavailableError when this environment has no Stripe keys.
   * @throws PaymentGatewayError when Stripe cannot be reached or refuses the call.
   */
  async open(request: PaymentRequest): Promise<PaymentSession> {
    const stripe = this.config.payments.stripe;
    if (!stripe) throw new PaymentsUnavailableError();
    const intent = request.paymentIntentId
      ? await this.gateway.retrievePaymentIntent(request.paymentIntentId)
      : await this.gateway.createPaymentIntent({
          orderId: request.orderId,
          amountCents: request.amountCents,
          currency: "BRL",
          idempotencyKey: `pi:${request.orderId}`,
        });
    return {
      paymentIntentId: intent.id,
      clientSecret: intent.clientSecret,
      publishableKey: stripe.publishableKey,
    };
  }
}
