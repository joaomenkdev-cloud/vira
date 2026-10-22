import { describe, expect, it } from "vitest";

import { lookOf, vibrationOf } from "./result";

const TICKET = { code: "VIRA-7KQ2-M9XD", holderName: "Ana Souza", ticketType: "Pista" };
const TZ = "America/Sao_Paulo";

describe("check-in result", () => {
  it("never tells two results apart by colour alone", () => {
    const looks = [
      lookOf({ result: "VALID", ticket: TICKET }, TZ),
      lookOf({ result: "ALREADY_USED", ticket: TICKET, usedAt: "2026-12-06T00:42:00Z" }, TZ),
      lookOf({ result: "WRONG_EVENT" }, TZ),
      lookOf({ result: "INVALID", ticket: TICKET }, TZ),
      lookOf({ result: "INVALID" }, TZ),
    ];
    expect(looks.map((look) => look.title)).toEqual([
      "Válido",
      "Já utilizado às 21:42",
      "Outro evento",
      "Cancelado",
      "Inválido",
    ]);
    expect(new Set(looks.map((look) => look.title)).size).toBe(looks.length);
    // Only a valid ticket is green, with its own icon.
    expect(looks.filter((look) => look.className.includes("success"))).toHaveLength(1);
    expect(looks.filter((look) => look.icon === looks[0]?.icon)).toHaveLength(1);
  });

  it("vibrates once for yes and several times for no", () => {
    expect(vibrationOf({ result: "VALID" })).toHaveLength(1);
    expect(vibrationOf({ result: "ALREADY_USED" }).length).toBeGreaterThan(1);
  });
});
