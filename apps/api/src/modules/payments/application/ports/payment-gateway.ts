/** What a PaymentIntent is created with: the amount always comes from the database. */
export interface NewPaymentIntent {
  readonly orderId: string;
  readonly amountCents: number;
  readonly currency: "BRL";
  /** Stripe's own idempotency key: a retried call answers the same PaymentIntent. */
  readonly idempotencyKey: string;
}

/** The parts of a PaymentIntent the application uses. */
export interface PaymentIntent {
  /** `pi_...` */
  readonly id: string;
  /** Lets the browser confirm this PaymentIntent, and only this one, with the Payment Element. */
  readonly clientSecret: string;
  readonly amountCents: number;
  readonly status: string;
}

/**
 * The payment provider (ADR-0006): Stripe in test mode, a fake in the tests. No card data
 * ever goes through it; the browser confirms the payment with Stripe directly.
 */
export interface PaymentGateway {
  /** @throws PaymentGatewayError when the provider cannot be reached or refuses the call. */
  createPaymentIntent(intent: NewPaymentIntent): Promise<PaymentIntent>;

  /** @throws PaymentGatewayError when the provider cannot be reached or refuses the call. */
  retrievePaymentIntent(id: string): Promise<PaymentIntent>;
}

export const PAYMENT_GATEWAY = Symbol("PAYMENT_GATEWAY");

/** The provider did not answer, refused the call or answered something unexpected. */
export class PaymentGatewayError extends Error {
  constructor(readonly reason: string) {
    super(`Payment gateway failed: ${reason}`);
    this.name = "PaymentGatewayError";
  }
}
