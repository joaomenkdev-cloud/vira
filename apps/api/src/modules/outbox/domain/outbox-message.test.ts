import { QUEUE_NAMES } from "@vira/shared";
import { describe, expect, it } from "vitest";

import { OUTBOX_CATALOG, OUTBOX_TYPES, queueFor } from "./outbox-catalog.js";
import { buildOutboxMessage, InvalidOutboxEventError, type OutboxEvent } from "./outbox-message.js";
import {
  backoffDelayMs,
  describeFailure,
  MAX_DISPATCH_ATTEMPTS,
  nextAttemptAt,
} from "./retry-policy.js";

const stamp = {
  id: "0192a0e4-0000-7000-8000-000000000001",
  createdAt: new Date("2026-10-08T12:00:00Z"),
};
const orderId = "0192a0e4-0000-7000-8000-0000000000bb";

describe("buildOutboxMessage", () => {
  it("builds an immutable message that has not been attempted", () => {
    const message = buildOutboxMessage({ type: "orders.paid", payload: { orderId } }, stamp);
    expect(message).toEqual({
      id: stamp.id,
      type: "orders.paid",
      payload: { orderId },
      createdAt: stamp.createdAt,
      attempts: 0,
    });
    expect(Object.isFrozen(message)).toBe(true);
    expect(Object.isFrozen(message.payload)).toBe(true);
  });

  it("rejects payload fields outside the catalog, such as personal data", () => {
    const event = {
      type: "tickets.issued",
      payload: { orderId, buyerEmail: "maria@example.com" },
    } as unknown as OutboxEvent;
    expect(() => buildOutboxMessage(event, stamp)).toThrow(InvalidOutboxEventError);
  });

  it("rejects malformed ids without echoing the value", () => {
    const event = {
      type: "orders.paid",
      payload: { orderId: "maria@example.com" },
    } as unknown as OutboxEvent;
    try {
      buildOutboxMessage(event, stamp);
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain("orderId");
      expect((error as Error).message).not.toContain("maria@example.com");
    }
  });
});

describe("outbox catalog", () => {
  it("routes every type to a known queue", () => {
    for (const type of OUTBOX_TYPES) expect(QUEUE_NAMES).toContain(queueFor(type));
  });

  it("uses the type format enforced by the database", () => {
    for (const type of OUTBOX_TYPES) expect(type).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("only allows identifier fields in payloads", () => {
    for (const type of OUTBOX_TYPES) {
      const keys = Object.keys(OUTBOX_CATALOG[type].payload.shape);
      expect(
        keys.filter((key) => !key.endsWith("Id")),
        type,
      ).toEqual([]);
    }
  });
});

describe("retry policy", () => {
  it("backs off exponentially from 5 seconds", () => {
    expect([1, 2, 3, 4].map(backoffDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
  });

  it("caps the delay at 15 minutes", () => {
    expect(backoffDelayMs(MAX_DISPATCH_ATTEMPTS)).toBe(15 * 60_000);
    expect(backoffDelayMs(50)).toBe(15 * 60_000);
  });

  it("schedules the next attempt after the delay", () => {
    expect(nextAttemptAt(new Date("2026-10-08T12:00:00Z"), 2)).toEqual(
      new Date("2026-10-08T12:00:10Z"),
    );
  });

  it("describes failures on one truncated line", () => {
    const text = describeFailure(new TypeError(`bad\nthing ${"x".repeat(500)}`));
    expect(text.startsWith("TypeError: bad thing ")).toBe(true);
    expect(text).not.toContain("\n");
    expect(text.length).toBe(200);
    expect(describeFailure("boom")).toBe("Error:");
  });
});
