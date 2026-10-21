import { describe, expect, it } from "vitest";

import { createOrderRequestSchema, idempotencyKeySchema } from "./orders.js";

const eventId = "0192a0e4-0000-7000-8000-000000000001";
const ticketTypeId = "0192a0e4-0000-7000-8000-000000000002";
const order = { eventId, items: [{ ticketTypeId, quantity: 2 }] };

describe("order request schemas", () => {
  it("accepts an event and its items", () => {
    expect(createOrderRequestSchema.parse(order)).toEqual(order);
  });

  it.each([
    ["priceCents", 1],
    ["totalCents", 1],
    ["status", "PAID"],
    ["buyerId", eventId],
  ])("refuses %s in the body (mass assignment)", (field, value) => {
    expect(createOrderRequestSchema.safeParse({ ...order, [field]: value }).success).toBe(false);
    const item = { ticketTypeId, quantity: 1, [field]: value };
    expect(createOrderRequestSchema.safeParse({ eventId, items: [item] }).success).toBe(false);
  });

  it.each([0, 21, 1.5, -1])("refuses a quantity of %s", (quantity) => {
    expect(
      createOrderRequestSchema.safeParse({ eventId, items: [{ ticketTypeId, quantity }] }).success,
    ).toBe(false);
  });

  it("refuses an empty order", () => {
    expect(createOrderRequestSchema.safeParse({ eventId, items: [] }).success).toBe(false);
  });

  it("refuses the same ticket type twice, pointing at the repeated line", () => {
    const result = createOrderRequestSchema.safeParse({
      eventId,
      items: [
        { ticketTypeId, quantity: 1 },
        { ticketTypeId, quantity: 1 },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["items", 1, "ticketTypeId"]);
  });

  it("takes only UUIDs as idempotency keys", () => {
    expect(idempotencyKeySchema.safeParse(eventId).success).toBe(true);
    expect(idempotencyKeySchema.safeParse("tentativa-1").success).toBe(false);
  });
});
