import { Inject, Injectable } from "@nestjs/common";
import type Stripe from "stripe";
import { z } from "zod";

import {
  type NewPaymentIntent,
  type PaymentGateway,
  PaymentGatewayError,
  type PaymentIntent,
} from "../application/ports/payment-gateway.js";

export const STRIPE_CLIENT = Symbol("STRIPE_CLIENT");

/** What we read from Stripe's answer, checked before use (OWASP API10). */
const paymentIntentSchema = z.object({
  id: z.string().regex(/^pi_[A-Za-z0-9]+$/),
  client_secret: z.string().regex(/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/),
  amount: z.number().int().positive(),
  currency: z.literal("brl"),
  livemode: z.literal(false),
  status: z.string(),
});

function paymentIntentOf(raw: unknown): PaymentIntent {
  const parsed = paymentIntentSchema.safeParse(raw, { reportInput: false });
  if (!parsed.success) throw new PaymentGatewayError("unexpected response");
  return {
    id: parsed.data.id,
    clientSecret: parsed.data.client_secret,
    amountCents: parsed.data.amount,
    status: parsed.data.status,
  };
}

/** Stripe's error class names only: their messages may echo request data. */
function gatewayError(error: unknown): PaymentGatewayError {
  if (error instanceof PaymentGatewayError) return error;
  const type =
    typeof error === "object" && error !== null && "type" in error ? String(error.type) : null;
  return new PaymentGatewayError(type ?? "unreachable");
}

/** Payment Intents over the official SDK, in test mode only (the config refuses live keys). */
@Injectable()
export class StripePaymentGateway implements PaymentGateway {
  /** `null` without keys: `PaymentIntents` refuses before calling it. */
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null) {}

  async createPaymentIntent(intent: NewPaymentIntent): Promise<PaymentIntent> {
    try {
      const created = await this.client().paymentIntents.create(
        {
          amount: intent.amountCents,
          currency: intent.currency.toLowerCase(),
          automatic_payment_methods: { enabled: true },
          // Identifiers only: no names or e-mails go to Stripe (docs/PRIVACY.md).
          metadata: { orderId: intent.orderId },
        },
        { idempotencyKey: intent.idempotencyKey },
      );
      return paymentIntentOf(created);
    } catch (error) {
      throw gatewayError(error);
    }
  }

  async retrievePaymentIntent(id: string): Promise<PaymentIntent> {
    try {
      return paymentIntentOf(await this.client().paymentIntents.retrieve(id));
    } catch (error) {
      throw gatewayError(error);
    }
  }

  private client(): Stripe {
    if (!this.stripe) throw new PaymentGatewayError("not configured");
    return this.stripe;
  }
}
