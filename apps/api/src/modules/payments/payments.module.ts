import { Module } from "@nestjs/common";
import Stripe from "stripe";

import { APP_CONFIG } from "../../platform/config/config.module.js";
import type { AppConfig } from "../../platform/config/config.schema.js";
import { PaymentIntents } from "./application/payment-intents.js";
import { PAYMENT_GATEWAY } from "./application/ports/payment-gateway.js";
import { STRIPE_CLIENT, StripePaymentGateway } from "./infra/stripe-payment-gateway.js";

/** Stripe calls give up after this long; the SDK retries twice on network errors. */
const STRIPE_TIMEOUT_MS = 10_000;

/**
 * Payments with Stripe in test mode (ADR-0006): PaymentIntents (V3); the webhook comes
 * with V4. Without keys the client is never created and opening a payment answers `503`.
 */
@Module({
  providers: [
    PaymentIntents,
    {
      provide: STRIPE_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Stripe | null =>
        config.payments.stripe
          ? new Stripe(config.payments.stripe.secretKey, {
              timeout: STRIPE_TIMEOUT_MS,
              maxNetworkRetries: 2,
              telemetry: false,
            })
          : null,
    },
    { provide: PAYMENT_GATEWAY, useClass: StripePaymentGateway },
  ],
  exports: [PaymentIntents],
})
export class PaymentsModule {}
