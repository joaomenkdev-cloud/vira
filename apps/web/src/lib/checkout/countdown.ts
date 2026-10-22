/**
 * The reservation countdown (docs/DESIGN.md, 3.11): it changes on screen every second but
 * speaks to screen readers only at 5, 2 and 1 minutes left and when the time is up.
 */

/** Below this, the countdown turns to `warning` and offers to keep the reservation. */
export const WARNING_SECONDS = 2 * 60;

const ANNOUNCED_AT = [5 * 60, 2 * 60, 60] as const;

export function secondsLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

/** "09:41". */
export function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * What to announce when the countdown moves from `previous` to `current` seconds, if
 * it crossed a mark. A tab that slept through several marks announces only the last one.
 */
export function announcementFor(previous: number, current: number): string | null {
  if (current >= previous) return null;
  if (current === 0) return "Sua reserva expirou.";
  const crossed = ANNOUNCED_AT.filter((mark) => previous > mark && current <= mark).at(-1);
  if (crossed === undefined) return null;
  return crossed === 60
    ? "Falta 1 minuto para a reserva expirar."
    : `Faltam ${String(crossed / 60)} minutos para a reserva expirar.`;
}
