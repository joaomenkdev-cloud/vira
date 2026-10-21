/**
 * Checks the `Stripe-Signature` of a webhook over the exact bytes received (ADR-0006), with
 * a 5-minute tolerance on its timestamp, and answers the event it signs. Nothing about the
 * event may be trusted before this.
 */
export interface WebhookVerifier {
  /** @throws InvalidWebhookSignatureError when the signature does not match or is too old. */
  verify(rawBody: Buffer, signature: string, secret: string): unknown;
}

export const WEBHOOK_VERIFIER = Symbol("WEBHOOK_VERIFIER");

export class InvalidWebhookSignatureError extends Error {
  constructor() {
    super("Invalid webhook signature");
    this.name = "InvalidWebhookSignatureError";
  }
}
