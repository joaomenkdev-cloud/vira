import { MAX_DISPATCH_ATTEMPTS, nextAttemptAt } from "./retry-policy.js";

/** The delivery bookkeeping of a message after one dispatch attempt. */
export interface DeliveryState {
  readonly attempts: number;
  readonly dispatchedAt: Date | null;
  /** Earliest time of the next attempt. */
  readonly availableAt: Date;
  readonly lastError: string | null;
}

/**
 * Applies the outcome of one dispatch attempt. Success marks the message delivered;
 * failure schedules the next attempt with exponential backoff. After
 * `MAX_DISPATCH_ATTEMPTS` failures the message stops being picked up (see
 * `isParked`) so it can be inspected instead of retried forever.
 */
export function recordAttempt(
  previousAttempts: number,
  outcome: { readonly error?: string },
  now: Date,
): DeliveryState {
  const attempts = previousAttempts + 1;
  if (outcome.error === undefined) {
    return { attempts, dispatchedAt: now, availableAt: now, lastError: null };
  }
  return {
    attempts,
    dispatchedAt: null,
    availableAt: nextAttemptAt(now, attempts),
    lastError: outcome.error,
  };
}

export function isParked(attempts: number): boolean {
  return attempts >= MAX_DISPATCH_ATTEMPTS;
}
