import { Injectable } from "@nestjs/common";

import type { TransactionContext } from "../../../platform/database/transaction.js";

/** A PaymentIntent that Stripe says succeeded, as its signed event describes it. */
export interface SucceededPayment {
  readonly paymentIntentId: string;
  /** From the PaymentIntent's metadata, set when it was created. */
  readonly orderId: string;
  readonly amountCents: number;
  readonly currency: "BRL";
}

/** Work to do once the transaction committed (audit entries, logs). */
export type AfterCommit = () => Promise<void>;

/** Applies a succeeded payment in the webhook's transaction. */
export type PaymentSucceededHandler = (
  payment: SucceededPayment,
  tx: TransactionContext,
) => Promise<AfterCommit | undefined>;

/**
 * Where the module that owns orders subscribes to payments, so this module never depends
 * on it: the dependency goes one way, from orders to payments.
 */
@Injectable()
export class PaymentEvents {
  private succeeded: PaymentSucceededHandler | undefined;

  onPaymentSucceeded(handler: PaymentSucceededHandler): void {
    if (this.succeeded) throw new Error("A payment succeeded handler is already registered");
    this.succeeded = handler;
  }

  /** @throws Error when no module subscribed: the event must not be marked as processed. */
  async paymentSucceeded(
    payment: SucceededPayment,
    tx: TransactionContext,
  ): Promise<AfterCommit | undefined> {
    if (!this.succeeded) throw new Error("No payment succeeded handler registered");
    return this.succeeded(payment, tx);
  }
}
