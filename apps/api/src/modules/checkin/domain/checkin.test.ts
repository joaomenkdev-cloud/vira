import { describe, expect, it } from "vitest";

import { type Door, type DoorTicket, judge } from "./checkin.js";

const DOOR: Door = { eventId: "event-a", organizerId: "org-1" };
const NONCE = Buffer.alloc(16, 7);

const ticket = (overrides: Partial<DoorTicket> = {}): DoorTicket => ({
  id: "ticket-1",
  eventId: "event-a",
  organizerId: "org-1",
  status: "VALID",
  qrNonce: NONCE,
  code: "VIRA-7KQ2-M9XD",
  holderName: "Ana Souza",
  ticketTypeName: "Pista",
  usedAt: null,
  ...overrides,
});

const qr = { method: "QR", nonce: NONCE } as const;
const code = { method: "CODE" } as const;

describe("judging a read at the door", () => {
  it("lets in a valid ticket of this event, by QR or by code", () => {
    expect(judge(ticket(), qr, DOOR)).toEqual({ kind: "claim" });
    expect(judge(ticket(), code, DOOR)).toEqual({ kind: "claim" });
  });

  it("refuses a ticket that does not exist, naming nothing", () => {
    expect(judge(null, qr, DOOR)).toEqual({
      kind: "refuse",
      result: "INVALID",
      showTicket: false,
      recordTicket: false,
    });
  });

  it("refuses a QR from before the ticket was reissued, without showing it", () => {
    const verdict = judge(ticket(), { method: "QR", nonce: Buffer.alloc(16, 8) }, DOOR);
    expect(verdict).toMatchObject({ result: "INVALID", showTicket: false, recordTicket: true });
  });

  it("says a ticket already went in, and shows whose it is", () => {
    const used = ticket({ status: "USED", usedAt: new Date() });
    expect(judge(used, qr, DOOR)).toMatchObject({ result: "ALREADY_USED", showTicket: true });
    expect(judge(used, code, DOOR)).toMatchObject({ result: "ALREADY_USED", showTicket: true });
  });

  it("refuses a canceled ticket, showing which one it is", () => {
    const canceled = ticket({ status: "CANCELED" });
    expect(judge(canceled, qr, DOOR)).toMatchObject({ result: "INVALID", showTicket: true });
  });

  it("tells a signed QR of another event apart, without showing it", () => {
    const elsewhere = ticket({ eventId: "event-b", organizerId: "org-2" });
    expect(judge(elsewhere, qr, DOOR)).toEqual({
      kind: "refuse",
      result: "WRONG_EVENT",
      showTicket: false,
      recordTicket: true,
    });
  });

  it("tells a typed code apart only within the organizer's own events", () => {
    const sameOrganizer = ticket({ eventId: "event-b" });
    expect(judge(sameOrganizer, code, DOOR)).toMatchObject({ result: "WRONG_EVENT" });
    // Anyone else's code looks like one that does not exist: no guessing which codes do.
    const otherOrganizer = ticket({ eventId: "event-c", organizerId: "org-2" });
    expect(judge(otherOrganizer, code, DOOR)).toEqual({
      kind: "refuse",
      result: "INVALID",
      showTicket: false,
      recordTicket: false,
    });
  });
});
