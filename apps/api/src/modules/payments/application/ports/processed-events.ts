import type { TransactionContext } from "../../../../platform/database/transaction.js";

/** The Stripe events already applied (`processed_webhook_events`). */
export interface ProcessedEvents {
  /**
   * Records the event in the transaction of its effect; `false` when it was already
   * recorded (a redelivery), in which case nothing else must happen.
   */
  record(eventId: string, type: string, now: Date, tx: TransactionContext): Promise<boolean>;
}

export const PROCESSED_EVENTS = Symbol("PROCESSED_EVENTS");
