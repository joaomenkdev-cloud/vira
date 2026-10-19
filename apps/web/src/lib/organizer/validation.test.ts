import { describe, expect, it } from "vitest";

import {
  salesWindowValidators,
  validateCancelReason,
  validateCapacity,
  validateEndsAt,
  validateMaxPerOrder,
  validatePrice,
  validateStartsAt,
  validateTitle,
  validateVenueCity,
  validateVenueName,
  validateVenueState,
} from "./validation";

describe("event details", () => {
  it("asks for a title of 3 to 120 characters", () => {
    expect(validateTitle("")).toMatch(/Dê um nome/);
    expect(validateTitle("ab")).toMatch(/pelo menos 3/);
    expect(validateTitle("a".repeat(121))).toMatch(/até 120/);
    expect(validateTitle("Noite de forró")).toBeUndefined();
  });

  it("asks for complete dates, the end after the start", () => {
    expect(validateStartsAt("")).toMatch(/começa/);
    expect(validateStartsAt("2026-12-05")).toMatch(/data e o horário/);
    expect(validateStartsAt("2026-12-05T22:00")).toBeUndefined();
    const values = { startsAt: "2026-12-05T22:00" };
    expect(validateEndsAt("", values)).toMatch(/termina/);
    expect(validateEndsAt("2026-12-05T22:00", values)).toMatch(/depois do início/);
    expect(validateEndsAt("2026-12-05T21:00", values)).toMatch(/depois do início/);
    expect(validateEndsAt("2026-12-06T03:00", values)).toBeUndefined();
    // Without a valid start there is nothing to compare with yet.
    expect(validateEndsAt("2026-12-06T03:00", { startsAt: "" })).toBeUndefined();
  });

  it("takes a venue with every field, or no venue at all", () => {
    const empty = { venueName: "", venueAddress: "", venueCity: "", venueState: "" };
    expect(validateVenueName("", empty)).toBeUndefined();
    expect(validateVenueState("", empty)).toBeUndefined();

    const partial = { ...empty, venueName: "Circo Voador" };
    expect(validateVenueCity("", partial)).toMatch(/cidade/);
    expect(validateVenueState("", partial)).toMatch(/UF/);
    expect(validateVenueName("Circo Voador", partial)).toBeUndefined();
    expect(validateVenueName("a".repeat(121), partial)).toMatch(/até 120/);
  });
});

describe("ticket types", () => {
  it("asks for a price from R$ 1,00 to R$ 100.000,00", () => {
    expect(validatePrice("")).toMatch(/Informe o preço/);
    expect(validatePrice("oitenta")).toMatch(/80,00/);
    expect(validatePrice("0,99")).toMatch(/R\$ 1,00 a R\$ 100\.000,00/);
    expect(validatePrice("100.000,01")).toMatch(/R\$ 1,00 a R\$ 100\.000,00/);
    expect(validatePrice("80,00")).toBeUndefined();
  });

  it("asks for whole numbers within the limits", () => {
    expect(validateCapacity("0")).toMatch(/1 a 100\.000/);
    expect(validateCapacity("1,5")).toMatch(/inteiro/);
    expect(validateCapacity("200")).toBeUndefined();
    expect(validateMaxPerOrder("21")).toMatch(/1 a 20/);
    expect(validateMaxPerOrder("10")).toBeUndefined();
  });

  it("keeps the sales window in order and within the event", () => {
    const { salesStartAt, salesEndAt } = salesWindowValidators("2026-12-06T03:00");
    expect(salesStartAt("")).toBeUndefined();
    expect(salesStartAt("2026-12-06T03:00")).toMatch(/antes do fim do evento/);
    expect(salesStartAt("2026-11-01T10:00")).toBeUndefined();
    expect(salesEndAt("2026-11-01T09:00", { salesStartAt: "2026-11-01T10:00" })).toMatch(
      /depois do início/,
    );
    expect(salesEndAt("2026-12-06T03:01", { salesStartAt: "" })).toMatch(/até o fim do evento/);
    expect(salesEndAt("2026-12-06T03:00", { salesStartAt: "2026-11-01T10:00" })).toBeUndefined();
  });
});

describe("cancelation", () => {
  it("asks for a reason of 3 to 500 characters", () => {
    expect(validateCancelReason("")).toMatch(/por que/);
    expect(validateCancelReason("ok")).toMatch(/pelo menos 3/);
    expect(validateCancelReason("Chuva forte prevista.")).toBeUndefined();
  });
});
