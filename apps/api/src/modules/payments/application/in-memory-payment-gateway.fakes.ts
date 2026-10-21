import {
  type NewPaymentIntent,
  type PaymentGateway,
  PaymentGatewayError,
  type PaymentIntent,
} from "./ports/payment-gateway.js";

/**
 * PaymentIntents in memory, honoring Stripe's idempotency keys: the same key answers the
 * same PaymentIntent. `down` makes every call fail as if Stripe could not be reached.
 */
export class InMemoryPaymentGateway implements PaymentGateway {
  readonly intents = new Map<string, PaymentIntent & { readonly orderId: string }>();
  readonly created: NewPaymentIntent[] = [];
  down = false;
  private readonly byKey = new Map<string, string>();

  createPaymentIntent(intent: NewPaymentIntent): Promise<PaymentIntent> {
    if (this.down) return Promise.reject(new PaymentGatewayError("unreachable"));
    const existing = this.byKey.get(intent.idempotencyKey);
    if (existing) return this.retrievePaymentIntent(existing);
    this.created.push(intent);
    const id = `pi_fake${String(this.created.length).padStart(4, "0")}`;
    const created = {
      id,
      clientSecret: `${id}_secret_fake`,
      amountCents: intent.amountCents,
      status: "requires_payment_method",
      orderId: intent.orderId,
    };
    this.intents.set(id, created);
    this.byKey.set(intent.idempotencyKey, id);
    return Promise.resolve(created);
  }

  retrievePaymentIntent(id: string): Promise<PaymentIntent> {
    if (this.down) return Promise.reject(new PaymentGatewayError("unreachable"));
    const intent = this.intents.get(id);
    return intent
      ? Promise.resolve(intent)
      : Promise.reject(new PaymentGatewayError("invalid_request_error"));
  }
}
