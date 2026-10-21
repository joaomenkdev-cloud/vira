import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { z } from "zod";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { PaymentEvents } from "./payment-events.js";
import { PaymentsUnavailableError } from "./payment-intents.js";
import { PROCESSED_EVENTS, type ProcessedEvents } from "./ports/processed-events.js";
import { WEBHOOK_VERIFIER, type WebhookVerifier } from "./ports/webhook-verifier.js";

/** The events this API acts on (docs/API.md#pagamentos-payments); others are only acknowledged. */
const HANDLED_TYPES = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "charge.refunded",
]);

/** What is read from any event, once its signature is verified. */
const eventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9]{1,255}$/),
  type: z.string().regex(/^[a-z_]+(\.[a-z_]+)+$/),
  livemode: z.boolean(),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

/** The PaymentIntent of a `payment_intent.succeeded`. */
const succeededIntentSchema = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.literal("brl"),
  metadata: z.object({ orderId: z.uuid() }),
});

export type WebhookOutcome = "processed" | "duplicate" | "ignored";

/**
 * Applies a Stripe webhook (V4, ADR-0006). The signature is checked over the raw body
 * before anything else. The event is recorded in `processed_webhook_events` in the same
 * transaction as its effect, so a redelivery (or a concurrent duplicate) changes nothing,
 * and an effect that fails leaves the event unrecorded for Stripe to send again.
 */
@Injectable()
export class HandleStripeWebhook {
  constructor(
    @Inject(WEBHOOK_VERIFIER) private readonly verifier: WebhookVerifier,
    @Inject(PROCESSED_EVENTS) private readonly processed: ProcessedEvents,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: PaymentEvents,
    private readonly audit: AuditLog,
    @InjectPinoLogger(HandleStripeWebhook.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * @throws PaymentsUnavailableError when this environment has no webhook secret.
   * @throws InvalidWebhookSignatureError when the signature does not verify.
   */
  async execute(rawBody: Buffer, signature: string): Promise<WebhookOutcome> {
    const secret = this.config.payments.webhookSecret;
    if (!secret) throw new PaymentsUnavailableError();
    const event = eventSchema.safeParse(this.verifier.verify(rawBody, signature, secret), {
      reportInput: false,
    });
    if (!event.success) {
      this.logger.warn("Stripe event with an unexpected shape ignored");
      return "ignored";
    }
    const { id, type, livemode } = event.data;
    // The config refuses live keys; a live event can only come from a misconfigured endpoint.
    if (livemode || !HANDLED_TYPES.has(type)) {
      this.logger.info({ stripeEventId: id, type, livemode }, "Stripe event ignored");
      return "ignored";
    }

    let payment: z.infer<typeof succeededIntentSchema> | undefined;
    if (type === "payment_intent.succeeded") {
      const parsed = succeededIntentSchema.safeParse(event.data.data.object, {
        reportInput: false,
      });
      if (!parsed.success) {
        this.logger.warn({ stripeEventId: id }, "Succeeded PaymentIntent without an order ignored");
        return "ignored";
      }
      payment = parsed.data;
    }

    const now = this.clock.now();
    const outcome = await this.transactions.run(async (tx) => {
      if (!(await this.processed.record(id, type, now, tx))) return { duplicate: true } as const;
      const after = payment
        ? await this.events.paymentSucceeded(
            {
              paymentIntentId: payment.id,
              orderId: payment.metadata.orderId,
              amountCents: payment.amount,
              currency: "BRL",
            },
            tx,
          )
        : undefined;
      return { duplicate: false, after } as const;
    });
    if (outcome.duplicate) return "duplicate";

    await this.audit.record(
      {
        action: "payment.webhook_processed",
        metadata: { stripeEventId: id, type },
      },
      { actor: "system" },
    );
    await outcome.after?.();
    this.logger.info({ stripeEventId: id, type }, "Stripe event processed");
    return "processed";
  }
}
