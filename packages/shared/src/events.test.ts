import { describe, expect, it } from "vitest";

import {
  createEventRequestSchema,
  createTicketTypeRequestSchema,
  isKnownTimeZone,
  listOrganizerEventsQuerySchema,
  MAX_PER_ORDER_DEFAULT,
  updateEventRequestSchema,
  updateTicketTypeRequestSchema,
} from "./events.js";

const event = {
  title: "  Noite de forró  ",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00-03:00",
  timezone: "America/Sao_Paulo",
};

describe("event request schemas", () => {
  it("trims the title and defaults the description", () => {
    expect(createEventRequestSchema.parse(event)).toMatchObject({
      title: "Noite de forró",
      descriptionMd: "",
    });
  });

  it.each([
    ["status", "PUBLISHED"],
    ["organizerId", "0192a0e4-0000-7000-8000-000000000001"],
    ["descriptionHtml", "<script>alert(1)</script>"],
    ["isDemo", true],
    ["slug", "outro"],
  ])("refuses %s in the body (mass assignment)", (field, value) => {
    expect(createEventRequestSchema.safeParse({ ...event, [field]: value }).success).toBe(false);
    expect(updateEventRequestSchema.safeParse({ [field]: value }).success).toBe(false);
  });

  it("refuses an end that is not after the start, across offsets", () => {
    const result = createEventRequestSchema.safeParse({
      ...event,
      endsAt: "2026-12-05T19:00:00-03:00", // the same instant as the start
    });
    expect(result.error?.issues[0]?.path).toEqual(["endsAt"]);
  });

  it("only takes IANA time zones the runtime knows", () => {
    expect(isKnownTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isKnownTimeZone("UTC")).toBe(true);
    expect(isKnownTimeZone("Brasil/Brasilia")).toBe(false);
    expect(createEventRequestSchema.safeParse({ ...event, timezone: "GMT-3" }).success).toBe(false);
  });

  it("takes a complete venue in a Brazilian state, or none", () => {
    const venue = { name: "Circo Voador", address: "Rua dos Arcos", city: "Rio", state: "RJ" };
    expect(createEventRequestSchema.safeParse({ ...event, venue }).success).toBe(true);
    expect(
      createEventRequestSchema.safeParse({ ...event, venue: { ...venue, state: "XX" } }).success,
    ).toBe(false);
    expect(
      createEventRequestSchema.safeParse({ ...event, venue: { name: "Só o nome" } }).success,
    ).toBe(false);
    expect(updateEventRequestSchema.parse({ venue: null })).toEqual({ venue: null });
  });

  it("refuses an empty edit", () => {
    expect(updateEventRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("ticket type request schemas", () => {
  const ticket = { name: "Pista", priceCents: 8000, capacity: 100 };

  it("defaults the per-order limit", () => {
    expect(createTicketTypeRequestSchema.parse(ticket).maxPerOrder).toBe(MAX_PER_ORDER_DEFAULT);
  });

  it.each([
    { priceCents: 99 }, // below R$ 1,00: paid tickets only in the MVP
    { priceCents: 80.5 },
    { capacity: 0 },
    { maxPerOrder: 21 },
    { sold: 10 },
    { reserved: 1 },
    { currency: "USD" },
  ])("refuses %j", (change) => {
    expect(createTicketTypeRequestSchema.safeParse({ ...ticket, ...change }).success).toBe(false);
  });

  it("refuses a sales window that ends before it starts", () => {
    const result = updateTicketTypeRequestSchema.safeParse({
      salesStartAt: "2026-11-02T00:00:00Z",
      salesEndAt: "2026-11-01T00:00:00Z",
    });
    expect(result.error?.issues[0]?.path).toEqual(["salesEndAt"]);
  });
});

describe("listOrganizerEventsQuerySchema", () => {
  it("reads the limit from the query string and bounds it", () => {
    expect(listOrganizerEventsQuerySchema.parse({ limit: "5" }).limit).toBe(5);
    expect(listOrganizerEventsQuerySchema.parse({}).limit).toBe(20);
    expect(listOrganizerEventsQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(listOrganizerEventsQuerySchema.safeParse({ organizerId: "x" }).success).toBe(false);
  });
});
