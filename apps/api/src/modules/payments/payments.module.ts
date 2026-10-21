import { Module, type Provider } from "@nestjs/common";
import Stripe from "stripe";

import { APP_CONFIG } from "../../platform/config/config.module.js";
import type { AppConfig } from "../../platform/config/config.schema.js";
import { AuditModule } from "../audit/audit.module.js";
import { HandleStripeWebhook } from "./application/handle-stripe-webhook.js";
import { PaymentEvents } from "./application/payment-events.js";
import { PaymentIntents } from "./application/payment-intents.js";
import { PAYMENT_GATEWAY } from "./application/ports/payment-gateway.js";
import { PROCESSED_EVENTS } from "./application/ports/processed-events.js";
import { WEBHOOK_VERIFIER } from "./application/ports/webhook-verifier.js";
import { RefundPayment } from "./application/refund-payment.js";
import { StripeWebhookController } from "./http/stripe-webhook.controller.js";
import { PaymentsJobHandlers } from "./infra/payments-job-handlers.js";
import { PrismaProcessedEvents } from "./infra/prisma-processed-events.js";
import { STRIPE_CLIENT, StripePaymentGateway } from "./infra/stripe-payment-gateway.js";
import { StripeWebhookVerifier } from "./infra/stripe-webhook-verifier.js";

/** Stripe calls give up after this long; the SDK retries twice on network errors. */
const STRIPE_TIMEOUT_MS = 10_000;

/** The Stripe client, or `null` without keys (it is then never called). */
const gateway: Provider[] = [
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
];

/**
 * Payments with Stripe in test mode (ADR-0006): PaymentIntents (V3) and the webhook (V4).
 * The orders module subscribes to `PaymentEvents` to apply a succeeded payment.
 */
@Module({
  imports: [AuditModule],
  controllers: [StripeWebhookController],
  providers: [
    PaymentIntents,
    PaymentEvents,
    HandleStripeWebhook,
    ...gateway,
    { provide: WEBHOOK_VERIFIER, useClass: StripeWebhookVerifier },
    { provide: PROCESSED_EVENTS, useClass: PrismaProcessedEvents },
  ],
  exports: [PaymentIntents, PaymentEvents],
})
export class PaymentsModule {}

/** Background work of payments: refunds. Imported by the worker (and embedded mode). */
@Module({
  providers: [RefundPayment, PaymentsJobHandlers, ...gateway],
})
export class PaymentsJobsModule {}
