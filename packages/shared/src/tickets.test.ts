import { describe, expect, it } from "vitest";

import { listTicketsQuerySchema, TICKET_CODE_PATTERN, ticketSummarySchema } from "./tickets.js";

describe("ticket schemas", () => {
  it("lists upcoming tickets by default", () => {
    expect(listTicketsQuerySchema.parse({})).toEqual({ when: "upcoming", limit: 20 });
    expect(listTicketsQuerySchema.parse({ when: "past", limit: "5" })).toMatchObject({
      when: "past",
      limit: 5,
    });
  });

  it("refuses an unknown filter or field", () => {
    expect(listTicketsQuerySchema.safeParse({ when: "all" }).success).toBe(false);
    expect(listTicketsQuerySchema.safeParse({ buyerId: "x" }).success).toBe(false);
  });

  it("accepts Crockford codes only", () => {
    expect(TICKET_CODE_PATTERN.test("VIRA-7KQ2-M9XD")).toBe(true);
    for (const code of [
      "VIRA-7KQ2-M9XI",
      "VIRA-7KQ2-M9X",
      "vira-7kq2-m9xd",
      "VIRA-ORD-7KQ2-M9XD",
    ]) {
      expect(TICKET_CODE_PATTERN.test(code)).toBe(false);
    }
  });

  it("never carries the QR token in a summary", () => {
    expect(ticketSummarySchema.shape).not.toHaveProperty("qrToken");
  });
});
