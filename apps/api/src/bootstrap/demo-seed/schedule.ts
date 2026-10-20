import type { DemoEvent, DemoTicketType } from "./demo-events.js";

const DAY_MS = 24 * 60 * 60_000;

/** The calendar date `instant` falls on in `timeZone`. */
function localDate(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

/** How far ahead of UTC the wall clock of `timeZone` is at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallClock - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a wall clock in `timeZone` shows the given date and time. */
export function zonedTime(
  date: { year: number; month: number; day: number },
  time: { hours: number; minutes: number },
  timeZone: string,
): Date {
  const asUtc = Date.UTC(date.year, date.month - 1, date.day, time.hours, time.minutes);
  // Two passes settle the offset even when the guess lands across a DST change.
  const first = asUtc - zoneOffsetMs(new Date(asUtc), timeZone);
  return new Date(asUtc - zoneOffsetMs(new Date(first), timeZone));
}

export interface EventDates {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/** When `event` happens if the seed runs at `now` (see `DemoEvent.schedule`). */
export function eventDates(event: DemoEvent, now: Date): EventDates {
  const { minDaysAhead, weekday, startTime, durationMinutes } = event.schedule;
  const today = localDate(now, event.timezone);
  // Calendar arithmetic on a UTC midnight: no zone or DST in the way.
  const earliest = new Date(
    Date.UTC(today.year, today.month - 1, today.day) + minDaysAhead * DAY_MS,
  );
  const day = new Date(earliest.getTime() + ((weekday - earliest.getUTCDay() + 7) % 7) * DAY_MS);
  const [hours = 0, minutes = 0] = startTime.split(":").map(Number);
  const startsAt = zonedTime(
    { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() },
    { hours, minutes },
    event.timezone,
  );
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
}

/** The sales window of a ticket type, `null` where it is open-ended. */
export function salesWindow(
  ticketType: DemoTicketType,
  dates: EventDates,
): { salesStartAt: Date | null; salesEndAt: Date | null } {
  const before = (days: number | undefined) =>
    days === undefined ? null : new Date(dates.startsAt.getTime() - days * DAY_MS);
  return {
    salesStartAt: before(ticketType.salesStartDaysBefore),
    salesEndAt: before(ticketType.salesEndDaysBefore),
  };
}
