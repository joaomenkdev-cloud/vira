import {
  attachEventImageRequestSchema,
  createEventRequestSchema,
  createTicketTypeRequestSchema,
} from "@vira/shared";
import { describe, expect, it } from "vitest";

import { DEMO_EVENTS } from "./demo-events.js";
import { eventDates, salesWindow, zonedTime } from "./schedule.js";

const NOW = new Date("2026-10-20T15:00:00Z"); // a Tuesday

describe("demo events", () => {
  it("are a handful of different events, each with its own key and slug", () => {
    expect(DEMO_EVENTS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(DEMO_EVENTS.map((event) => event.key)).size).toBe(DEMO_EVENTS.length);
    expect(new Set(DEMO_EVENTS.map((event) => event.slug)).size).toBe(DEMO_EVENTS.length);
    expect(new Set(DEMO_EVENTS.map((event) => event.venue.city)).size).toBe(DEMO_EVENTS.length);
  });

  it.each(DEMO_EVENTS)("$key passes the checks an organizer's event goes through", (event) => {
    const dates = eventDates(event, NOW);
    const created = createEventRequestSchema.safeParse({
      title: event.title,
      descriptionMd: event.descriptionMd,
      startsAt: dates.startsAt.toISOString(),
      endsAt: dates.endsAt.toISOString(),
      timezone: event.timezone,
      venue: event.venue,
    });
    expect(created.error).toBeUndefined();
    // events_slug_format; API slugs end in a 6-character suffix, these never collide.
    expect(event.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-demo$/);
    expect(event.slug.length).toBeLessThanOrEqual(80);

    expect(event.ticketTypes.length).toBeGreaterThan(0);
    expect(new Set(event.ticketTypes.map((ticketType) => ticketType.key)).size).toBe(
      event.ticketTypes.length,
    );
    for (const ticketType of event.ticketTypes) {
      const window = salesWindow(ticketType, dates);
      const parsed = createTicketTypeRequestSchema.safeParse({
        name: ticketType.name,
        description: ticketType.description,
        priceCents: ticketType.priceCents,
        capacity: ticketType.capacity,
        maxPerOrder: ticketType.maxPerOrder,
        salesStartAt: window.salesStartAt?.toISOString(),
        salesEndAt: window.salesEndAt?.toISOString(),
      });
      expect(parsed.error).toBeUndefined();
    }
    expect(
      event.ticketTypes.some((ticketType) => {
        const window = salesWindow(ticketType, dates);
        return (window.salesStartAt ?? NOW) <= NOW && (window.salesEndAt ?? dates.endsAt) > NOW;
      }),
    ).toBe(true);
  });

  it.each(DEMO_EVENTS)("$key credits a free-licensed photo", ({ photo }) => {
    expect(photo.sourceUrl).toMatch(/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?/);
    expect(photo.credit.url).toMatch(/^https:\/\/unsplash\.com\/photos\/[\w-]+$/);
    expect(photo.credit.author.trim()).not.toBe("");
    expect(photo.credit.license).toBe("Licença Unsplash");
    expect(attachEventImageRequestSchema.shape.alt.safeParse(photo.alt).success).toBe(true);
  });
});

describe("demo schedule", () => {
  it("turns a wall clock in the event's zone into an instant", () => {
    const date = { year: 2026, month: 11, day: 6 };
    expect(zonedTime(date, { hours: 21, minutes: 0 }, "America/Sao_Paulo").toISOString()).toBe(
      "2026-11-07T00:00:00.000Z",
    );
    expect(zonedTime(date, { hours: 21, minutes: 30 }, "America/Manaus").toISOString()).toBe(
      "2026-11-07T01:30:00.000Z",
    );
    // Across a daylight saving change: Europe/Lisbon is UTC+1 in summer, UTC in winter.
    expect(
      zonedTime({ year: 2026, month: 7, day: 1 }, { hours: 12, minutes: 0 }, "Europe/Lisbon"),
    ).toEqual(new Date("2026-07-01T11:00:00Z"));
  });

  it("puts each event on its weekday, in the future, at its local time", () => {
    for (const event of DEMO_EVENTS) {
      const { startsAt, endsAt } = eventDates(event, NOW);
      const local = new Intl.DateTimeFormat("en-US", {
        timeZone: event.timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(startsAt);
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][event.schedule.weekday];
      expect(local).toBe(`${weekday} ${event.schedule.startTime}`);
      expect(startsAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(
        (event.schedule.minDaysAhead - 1) * 24 * 60 * 60_000,
      );
      expect(endsAt.getTime() - startsAt.getTime()).toBe(event.schedule.durationMinutes * 60_000);
    }
  });

  it("moves forward with the day the seed runs", () => {
    const [event] = DEMO_EVENTS;
    if (!event) throw new Error("no demo events");
    const later = new Date(NOW.getTime() + 30 * 24 * 60 * 60_000);
    expect(eventDates(event, later).startsAt > eventDates(event, NOW).startsAt).toBe(true);
    expect(eventDates(event, NOW)).toEqual(eventDates(event, new Date(NOW.getTime() + 60_000)));
  });
});
