import { describe, expect, it } from "vitest";

import { formatCents, parsePriceToCents } from "./money";

describe("parsePriceToCents", () => {
  it("reads reais as Brazilians type them", () => {
    expect(parsePriceToCents("80")).toBe(8000);
    expect(parsePriceToCents("80,00")).toBe(8000);
    expect(parsePriceToCents("80,5")).toBe(8050);
    expect(parsePriceToCents(" R$ 1.250,50 ")).toBe(125050);
    expect(parsePriceToCents("100.000,00")).toBe(10_000_000);
  });

  it("refuses what is not an amount in reais", () => {
    for (const text of ["", "abc", "80.00", "80,001", "-10", "1.25,00", "1e3", "R$"]) {
      expect(parsePriceToCents(text)).toBeNull();
    }
  });
});

describe("formatCents", () => {
  it("writes the amount as the price field shows it", () => {
    expect(formatCents(8000)).toBe("80,00");
    expect(formatCents(125050)).toBe("1.250,50");
  });

  it("round-trips through the parser", () => {
    for (const cents of [100, 8050, 125050, 10_000_000]) {
      expect(parsePriceToCents(formatCents(cents))).toBe(cents);
    }
  });
});
