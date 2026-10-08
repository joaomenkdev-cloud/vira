import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, AUDIT_CATALOG } from "./audit-catalog.js";
import { type AuditEvent, buildAuditEntry, InvalidAuditEventError } from "./audit-entry.js";

const stamp = {
  id: "0192a0e4-0000-7000-8000-000000000001",
  occurredAt: new Date("2026-10-08T12:00:00Z"),
};
const organizer = { id: "0192a0e4-0000-7000-8000-0000000000aa", role: "ORGANIZER" } as const;
const orderId = "0192a0e4-0000-7000-8000-0000000000bb";
const eventId = "0192a0e4-0000-7000-8000-0000000000cc";

describe("buildAuditEntry", () => {
  it("records who did what to which entity", () => {
    const entry = buildAuditEntry(
      { action: "event.published", entityId: eventId, metadata: {} },
      { actor: organizer, requestId: "req-12345678" },
      stamp,
    );
    expect(entry).toEqual({
      id: stamp.id,
      occurredAt: stamp.occurredAt,
      actorId: organizer.id,
      actorRole: "ORGANIZER",
      action: "event.published",
      entityType: "event",
      entityId: eventId,
      requestId: "req-12345678",
      metadata: {},
    });
  });

  it("records system actions without an actor", () => {
    const entry = buildAuditEntry(
      {
        action: "order.paid",
        entityId: orderId,
        metadata: { totalCents: 16_000, paymentIntentId: "pi_3Q2", late: false },
      },
      { actor: "system" },
      stamp,
    );
    expect(entry).toMatchObject({
      actorId: null,
      actorRole: "SYSTEM",
      entityType: "order",
      requestId: null,
    });
  });

  it("is immutable", () => {
    const entry = buildAuditEntry(
      { action: "user.anonymized", entityId: organizer.id, metadata: {} },
      { actor: "system" },
      stamp,
    );
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.metadata)).toBe(true);
  });

  it("rejects metadata keys outside the catalog, such as personal data", () => {
    const event = {
      action: "order.created",
      entityId: orderId,
      metadata: { eventId, totalCents: 100, ticketCount: 1, buyerEmail: "maria@example.com" },
    } as unknown as AuditEvent;

    expect(() => buildAuditEntry(event, { actor: organizer }, stamp)).toThrow(
      InvalidAuditEventError,
    );
  });

  it("rejects metadata of the wrong shape without echoing the values", () => {
    const event = {
      action: "payment.webhook_processed",
      metadata: { stripeEventId: "maria@example.com", type: "payment_intent.succeeded" },
    } as unknown as AuditEvent;

    try {
      buildAuditEntry(event, { actor: "system" }, stamp);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAuditEventError);
      expect((error as Error).message).toContain("stripeEventId");
      expect((error as Error).message).not.toContain("maria@example.com");
    }
  });
});

describe("audit catalog", () => {
  it("uses the action format enforced by the database", () => {
    for (const action of AUDIT_ACTIONS) expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("never declares metadata fields that hold personal data", () => {
    const personal = /name|email|phone|cpf|address|holder|password|token|^ip(address)?$/i;
    for (const action of AUDIT_ACTIONS) {
      const keys = Object.keys(AUDIT_CATALOG[action].metadata.shape);
      expect(
        keys.filter((key) => personal.test(key)),
        action,
      ).toEqual([]);
    }
  });
});
