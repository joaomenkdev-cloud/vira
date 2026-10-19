import { describe, expect, it } from "vitest";

import {
  available,
  type CatalogTicketType,
  isSoldOut,
  priceFromCents,
  salesStatus,
} from "./catalog-event.js";

const now = new Date("2026-11-01T12:00:00Z");
const event = { status: "PUBLISHED" as const, endsAt: new Date("2026-12-06T03:00:00Z") };

function ticketType(changes: Partial<CatalogTicketType> = {}): CatalogTicketType {
  return {
    id: "0192a0e4-0000-7000-8000-0000000000t1",
    name: "Pista",
    description: null,
    priceCents: 8000,
    capacity: 100,
    sold: 0,
    reserved: 0,
    maxPerOrder: 10,
    salesStartAt: null,
    salesEndAt: null,
    ...changes,
  };
}

describe("tickets left", () => {
  it("counts neither sold nor reserved tickets", () => {
    expect(available(ticketType({ sold: 60, reserved: 15 }))).toBe(25);
  });

  it("never goes below zero", () => {
    expect(available(ticketType({ capacity: 10, sold: 10, reserved: 1 }))).toBe(0);
  });
});

describe("sales status", () => {
  it("is on sale with tickets left and no window", () => {
    expect(salesStatus(event, ticketType(), now)).toBe("ON_SALE");
  });

  it("has not started before the window opens", () => {
    const later = ticketType({ salesStartAt: new Date("2026-11-02T00:00:00Z") });
    expect(salesStatus(event, later, now)).toBe("NOT_STARTED");
  });

  it("is closed once the window ends, or the event does", () => {
    expect(salesStatus(event, ticketType({ salesEndAt: now }), now)).toBe("CLOSED");
    expect(salesStatus(event, ticketType(), event.endsAt)).toBe("CLOSED");
  });

  it("is closed for a canceled event, even with tickets left", () => {
    expect(salesStatus({ ...event, status: "CANCELED" }, ticketType(), now)).toBe("CLOSED");
  });

  it("is sold out when nothing is left in an open window", () => {
    expect(salesStatus(event, ticketType({ sold: 99, reserved: 1 }), now)).toBe("SOLD_OUT");
  });
});

describe("price from and sold out", () => {
  it("takes the cheapest ticket still left", () => {
    const ticketTypes = [
      ticketType({ priceCents: 5000, sold: 100 }),
      ticketType({ priceCents: 12000 }),
      ticketType({ priceCents: 8000 }),
    ];
    expect(priceFromCents({ ticketTypes })).toBe(8000);
    expect(isSoldOut({ ticketTypes })).toBe(false);
  });

  it("has no price when every ticket is gone", () => {
    const ticketTypes = [ticketType({ sold: 100 }), ticketType({ reserved: 100 })];
    expect(priceFromCents({ ticketTypes })).toBeNull();
    expect(isSoldOut({ ticketTypes })).toBe(true);
  });

  it("does not call an event without ticket types sold out", () => {
    expect(isSoldOut({ ticketTypes: [] })).toBe(false);
    expect(priceFromCents({ ticketTypes: [] })).toBeNull();
  });
});
