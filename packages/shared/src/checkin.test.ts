import { describe, expect, it } from "vitest";

import {
  checkinCodeRequestSchema,
  checkinResponseSchema,
  checkinScanRequestSchema,
  normalizeTicketCode,
} from "./checkin.js";

const EVENT = "0192a0e4-0000-7000-8000-0000000e0001";

describe("check-in schemas", () => {
  it("forgives how the operator types a code", () => {
    for (const typed of [
      "VIRA-7KQ2-M9XD",
      "vira-7kq2-m9xd",
      "7KQ2M9XD",
      " 7kq2 m9xd ",
      "VIRA 7KQ2-M9XD",
    ]) {
      expect(normalizeTicketCode(typed)).toBe("VIRA-7KQ2-M9XD");
    }
    // O, I and L are read as the digits Crockford Base32 means.
    expect(normalizeTicketCode("VIRA-O1IL-0000")).toBe("VIRA-0111-0000");
  });

  it("refuses a code that is not eight symbols long", () => {
    for (const code of ["", "7KQ2", "VIRA-7KQ2-M9XDX", "VIRA-ORD-7KQ2-M9XD", "VIRA-7KQ2-M9XU"]) {
      expect(checkinCodeRequestSchema.safeParse({ eventId: EVENT, code }).success).toBe(false);
    }
    expect(checkinCodeRequestSchema.parse({ eventId: EVENT, code: "7kq2-m9xd" })).toEqual({
      eventId: EVENT,
      code: "VIRA-7KQ2-M9XD",
    });
  });

  it("takes the token as it was read, within a bound, and nothing else", () => {
    expect(checkinScanRequestSchema.safeParse({ eventId: EVENT, token: "x" }).success).toBe(true);
    expect(checkinScanRequestSchema.safeParse({ eventId: EVENT, token: "" }).success).toBe(false);
    expect(
      checkinScanRequestSchema.safeParse({ eventId: EVENT, token: "x".repeat(257) }).success,
    ).toBe(false);
    expect(
      checkinScanRequestSchema.safeParse({ eventId: EVENT, token: "x", ticketId: EVENT }).success,
    ).toBe(false);
  });

  it("shows the door only the holder, the type and the code", () => {
    expect(Object.keys(checkinResponseSchema.shape.ticket.unwrap().shape).sort()).toEqual([
      "code",
      "holderName",
      "ticketType",
    ]);
  });
});
