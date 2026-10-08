import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { OutboxMessage } from "../../domain/outbox-message.js";

/** What happened to one message of a batch. A missing `error` means it was delivered. */
export interface DispatchOutcome {
  readonly id: string;
  readonly error?: string;
}

export interface OutboxRepository {
  /** Stores a new message, inside `tx` when given so it commits or rolls back with it. */
  append(message: OutboxMessage, tx?: TransactionContext): Promise<void>;

  /**
   * Locks a batch of messages that are due and not yet delivered, hands it to
   * `process`, and records the outcomes before releasing the locks. Concurrent
   * dispatchers never receive the same message: locked rows are skipped.
   */
  processDue(
    limit: number,
    now: Date,
    process: (batch: readonly OutboxMessage[]) => Promise<readonly DispatchOutcome[]>,
  ): Promise<void>;

  /** Removes messages delivered before `cutoff`; returns how many. */
  purgeDispatchedBefore(cutoff: Date): Promise<number>;
}

export const OUTBOX_REPOSITORY = Symbol("OUTBOX_REPOSITORY");
