import { describe, expect, it } from "vitest";

import { extensionAvailable, newPublicCode, requestHash, totalCents } from "./order.js";
import { reservationExpiry, ticketTypeSalesRefusal } from "./reservation-policy.js";

const eventId = "0192a0e4-0000-7000-8000-000000000001";
const a = "0192a0e4-0000-7000-8000-00000000000a";
const b = "0192a0e4-0000-7000-8000-00000000000b";

describe("orders", () => {
  it("hashes a request the same whatever the order of its items or the case of its ids", () => {
    const one = requestHash({
      eventId,
      items: [
        { ticketTypeId: a, quantity: 1 },
        { ticketTypeId: b, quantity: 2 },
      ],
    });
    const same = requestHash({
      eventId: eventId.toUpperCase(),
      items: [
        { ticketTypeId: b.toUpperCase(), quantity: 2 },
        { ticketTypeId: a, quantity: 1 },
      ],
    });
    const other = requestHash({ eventId, items: [{ ticketTypeId: a, quantity: 2 }] });
    expect(one).toHaveLength(32);
    expect(same.equals(one)).toBe(true);
    expect(other.equals(one)).toBe(false);
  });

  it("makes public codes in Crockford Base32", () => {
    const codes = new Set(Array.from({ length: 200 }, newPublicCode));
    expect(codes.size).toBe(200);
    for (const code of codes)
      expect(code).toMatch(/^VIRA-ORD-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it("adds up the items", () => {
    expect(
      totalCents([
        { quantity: 2, unitPriceCents: 8000 },
        { quantity: 1, unitPriceCents: 25000 },
      ]),
    ).toBe(41000);
  });

  it("offers the extension only to a pending order that has not used it", () => {
    expect(extensionAvailable({ status: "PENDING", extensionCount: 0 })).toBe(true);
    expect(extensionAvailable({ status: "PENDING", extensionCount: 1 })).toBe(false);
    expect(extensionAvailable({ status: "EXPIRED", extensionCount: 0 })).toBe(false);
  });

  it("holds a reservation for 10 minutes", () => {
    expect(reservationExpiry(new Date("2026-11-01T12:00:00Z"))).toEqual(
      new Date("2026-11-01T12:10:00Z"),
    );
  });

  it("closes a ticket type without an end of its own when the event ends", () => {
    const event = {
      id: eventId,
      status: "PUBLISHED" as const,
      endsAt: new Date("2026-12-06T03:00:00Z"),
      ticketTypes: [],
    };
    const ticketType = {
      id: a,
      name: "Pista",
      priceCents: 8000,
      maxPerOrder: 10,
      salesStartAt: null,
      salesEndAt: null,
    };
    expect(ticketTypeSalesRefusal(event, ticketType, new Date("2026-12-06T02:59:59Z"))).toBeNull();
    expect(ticketTypeSalesRefusal(event, ticketType, event.endsAt)).toBe(
      'As vendas de "Pista" estão encerradas.',
    );
  });
});
