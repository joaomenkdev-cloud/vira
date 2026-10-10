/** Attempts after which a message is parked for manual inspection instead of retried. */
export const MAX_DISPATCH_ATTEMPTS = 10;

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15 * 60_000;

/** Exponential backoff: 5 s, 10 s, 20 s... capped at 15 min. `attempts` counts the failures so far. */
export function backoffDelayMs(attempts: number): number {
  if (attempts < 1) return 0;
  return Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
}

export function nextAttemptAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + backoffDelayMs(attempts));
}

/** How long delivered messages are kept before being purged (docs/DATA_MODEL.md). */
export const DISPATCHED_RETENTION_MS = 7 * 24 * 60 * 60_000;

const MAX_ERROR_LENGTH = 200;

/**
 * Reduces a failure to something safe to store: the error class and a truncated
 * message, on a single line.
 */
export function describeFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : "";
  return `${name}: ${message}`.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_LENGTH);
}
