import { Injectable } from "@nestjs/common";
import Stripe from "stripe";

import {
  InvalidWebhookSignatureError,
  type WebhookVerifier,
} from "../application/ports/webhook-verifier.js";

/** Stripe's documented default: a signed timestamp older than 5 minutes is a replay. */
const TOLERANCE_SECONDS = 300;

/** The SDK's own check (HMAC-SHA256 over `timestamp.body`, compared in constant time). */
@Injectable()
export class StripeWebhookVerifier implements WebhookVerifier {
  verify(rawBody: Buffer, signature: string, secret: string): unknown {
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, secret, TOLERANCE_SECONDS);
    } catch {
      throw new InvalidWebhookSignatureError();
    }
  }
}
