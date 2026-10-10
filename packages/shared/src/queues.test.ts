import { describe, expect, it } from "vitest";

import { outboxJobDataSchema, QUEUE_NAMES } from "./queues.js";

describe("outboxJobDataSchema", () => {
  const valid = {
    messageId: "0192a0e4-0000-7000-8000-000000000001",
    type: "orders.paid",
    payload: { orderId: "0192a0e4-0000-7000-8000-0000000000bb" },
  };

  it("accepts the data the dispatcher produces", () => {
    expect(outboxJobDataSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects unknown fields and malformed ids or types", () => {
    expect(outboxJobDataSchema.safeParse({ ...valid, email: "a@b.c" }).success).toBe(false);
    expect(outboxJobDataSchema.safeParse({ ...valid, messageId: "1" }).success).toBe(false);
    expect(outboxJobDataSchema.safeParse({ ...valid, type: "Orders Paid" }).success).toBe(false);
  });
});

describe("QUEUE_NAMES", () => {
  it("has unique names", () => {
    expect(new Set(QUEUE_NAMES).size).toBe(QUEUE_NAMES.length);
  });
});
