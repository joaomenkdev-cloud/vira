import type { QueueName } from "@vira/shared";
import { z } from "zod";

/**
 * Every message type the outbox can carry, the queue it is routed to and the shape
 * of its payload. Payloads hold identifiers only: consumers load whatever else they
 * need from the database, so no personal data ever sits in the outbox, in Redis or
 * in job logs (docs/PRIVACY.md).
 *
 * Routing is the initial plan from docs/ARCHITECTURE.md; each module that starts
 * producing or consuming a type adjusts its entry in its own pull request.
 */

const id = z.uuid();

export const OUTBOX_CATALOG = {
  /** A new account needs the link that verifies its e-mail; the consumer creates the token. */
  "auth.verification_email_requested": { queue: "email", payload: z.strictObject({ userId: id }) },
  /** Someone tried to register an address that already has an account. */
  "auth.account_exists_notice": { queue: "email", payload: z.strictObject({ userId: id }) },
  /** Someone asked for a password reset link for this account; the consumer creates the token. */
  "auth.password_reset_requested": { queue: "email", payload: z.strictObject({ userId: id }) },
  /** The password was changed or reset: its owner is told, in case it was not them. */
  "auth.password_changed_notice": { queue: "email", payload: z.strictObject({ userId: id }) },
  /** The account asked to move to its pending e-mail: link to the new address, notice to the old. */
  "auth.email_change_requested": { queue: "email", payload: z.strictObject({ userId: id }) },
  /** Another account tried to move to this account's address. */
  "auth.email_in_use_notice": { queue: "email", payload: z.strictObject({ userId: id }) },
  /** A paid order needs its tickets issued. */
  "orders.paid": { queue: "tickets", payload: z.strictObject({ orderId: id }) },
  /** Tickets exist; the buyer gets them by e-mail. */
  "tickets.issued": { queue: "email", payload: z.strictObject({ orderId: id }) },
  /** A late payment could not be honoured; the charge must be refunded. */
  "orders.refund_requested": {
    queue: "payments",
    payload: z.strictObject({
      orderId: id,
      paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]+$/),
    }),
  },
} as const satisfies Record<string, { queue: QueueName; payload: z.ZodType<object> }>;

export type OutboxType = keyof typeof OUTBOX_CATALOG;
export type OutboxPayload<T extends OutboxType> = z.input<(typeof OUTBOX_CATALOG)[T]["payload"]>;

export const OUTBOX_TYPES = Object.keys(OUTBOX_CATALOG) as OutboxType[];

export function queueFor(type: OutboxType): QueueName {
  return OUTBOX_CATALOG[type].queue;
}
