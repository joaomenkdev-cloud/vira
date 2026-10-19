/*
 * The panel asks for dates as the organizer reads them: the clock on the wall where the
 * event happens, in the event's time zone, whatever zone the browser is in. A native
 * `datetime-local` field gives "2026-12-05T22:00" with no zone; these functions turn it
 * into an instant the API stores, and back.
 */

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Milliseconds the zone is ahead of UTC at that instant (−3 h is −10 800 000). */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.get("year") ?? 0,
    (parts.get("month") ?? 1) - 1,
    parts.get("day") ?? 1,
    parts.get("hour") ?? 0,
    parts.get("minute") ?? 0,
    parts.get("second") ?? 0,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * "2026-12-05T22:00" in `America/Sao_Paulo` → "2026-12-06T01:00:00.000Z". `null` when
 * the text is not a complete date and time. A time that a daylight-saving jump skips is
 * moved forward by the jump, as clocks do.
 */
export function wallTimeToIso(wallTime: string, timeZone: string): string | null {
  const match = WALL_TIME.exec(wallTime);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const asUtc = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  if (Number.isNaN(asUtc) || new Date(asUtc).getUTCDate() !== day) return null;
  // The offset depends on the instant, which depends on the offset: two rounds settle it.
  let instant = asUtc - offsetAt(asUtc, timeZone);
  instant = asUtc - offsetAt(instant, timeZone);
  return new Date(instant).toISOString();
}

/** The other way: an instant as the wall clock of `timeZone` shows it ("2026-12-05T22:00"). */
export function isoToWallTime(iso: string, timeZone: string): string {
  const instant = Date.parse(iso);
  const local = new Date(instant + offsetAt(instant, timeZone));
  return local.toISOString().slice(0, 16);
}
