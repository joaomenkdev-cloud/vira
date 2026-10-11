/** Failed logins in a row that lock the account (docs/SECURITY_MODEL.md, 3.1). */
export const LOCKOUT_THRESHOLD = 5;

const BASE_LOCK_SECONDS = 60;
const MAX_LOCK_SECONDS = 60 * 60;

/**
 * Progressive lockout: the fifth failure in a row locks the account for a minute and
 * every further failure doubles the lock, up to an hour. Below the threshold there is
 * no lock (0).
 */
export function lockSecondsAfter(failedLoginCount: number): number {
  if (failedLoginCount < LOCKOUT_THRESHOLD) return 0;
  const doublings = Math.min(failedLoginCount - LOCKOUT_THRESHOLD, 12);
  return Math.min(BASE_LOCK_SECONDS * 2 ** doublings, MAX_LOCK_SECONDS);
}
