import type { PublicTicketType } from "@vira/shared";
import { describe, expect, it } from "vitest";

import { eventPathWith, isSelectable, maxQuantity, selectionFrom } from "./selection";

const PISTA = "00000000-0000-4000-8000-000000001001";
const SOLD_OUT = "00000000-0000-4000-8000-000000001002";

function ticketType(id: string, fields: Partial<PublicTicketType> = {}): PublicTicketType {
  return {
    id,
    name: "Pista",
    description: null,
    price: { amountCents: 8000, currency: "BRL" },
    maxPerOrder: 6,
    available: 100,
    salesStartAt: null,
    salesEndAt: null,
    salesStatus: "ON_SALE",
    ...fields,
  };
}

const event = {
  ticketTypes: [
    ticketType(PISTA, { available: 4 }),
    ticketType(SOLD_OUT, { available: 0, salesStatus: "SOLD_OUT" }),
  ],
};

describe("the ticket selection", () => {
  it("limits a type to its own maximum or to what is left", () => {
    expect(maxQuantity(ticketType(PISTA))).toBe(6);
    expect(maxQuantity(ticketType(PISTA, { available: 2 }))).toBe(2);
    expect(isSelectable(ticketType(PISTA, { salesStatus: "NOT_STARTED" }))).toBe(false);
  });

  it("reads the selection from the address, correcting what no longer fits", () => {
    expect(selectionFrom({ ingresso: PISTA, quantidade: "2" }, event)).toEqual({
      ticketTypeId: PISTA,
      quantity: 2,
    });
    expect(selectionFrom({ ingresso: PISTA, quantidade: "9" }, event)?.quantity).toBe(4);
    expect(selectionFrom({ ingresso: PISTA, quantidade: "0" }, event)?.quantity).toBe(1);
    expect(selectionFrom({ ingresso: PISTA, quantidade: "-1" }, event)?.quantity).toBe(1);
    expect(selectionFrom({ ingresso: PISTA }, event)?.quantity).toBe(1);
  });

  it("ignores a type that is not on sale, unknown or repeated", () => {
    expect(selectionFrom({ ingresso: SOLD_OUT, quantidade: "1" }, event)).toBeNull();
    expect(selectionFrom({ ingresso: "outro" }, event)).toBeNull();
    expect(selectionFrom({ ingresso: [PISTA, PISTA] }, event)).toBeNull();
    expect(selectionFrom({}, event)).toBeNull();
  });

  it("writes the selection into the event page's address", () => {
    expect(eventPathWith("forro", { ticketTypeId: PISTA, quantity: 2 })).toBe(
      `/eventos/forro?ingresso=${PISTA}&quantidade=2#ingressos`,
    );
    expect(eventPathWith("forro", null)).toBe("/eventos/forro#ingressos");
  });
});
