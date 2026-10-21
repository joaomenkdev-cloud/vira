import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri, type ProblemType } from "../src/platform/errors/problem-types.js";
import { RATE_LIMITER } from "../src/platform/rate-limit/rate-limiter.js";
import { AccessTokens } from "../src/platform/security/access-token.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";
import { InMemoryRateLimiter } from "./support/in-memory-rate-limiter.js";

const USER_ID = "0192a0e4-0000-7000-8000-000000000001";
const SESSION_ID = "0192a0e4-0000-7000-8000-0000000000aa";
const EVENT_ID = "0192a0e4-0000-7000-8000-0000000000e1";
const TICKET_TYPE_ID = "0192a0e4-0000-7000-8000-0000000000f1";
const KEY = "0192a0e4-1111-7000-8000-000000000001";

const body = { eventId: EVENT_ID, items: [{ ticketTypeId: TICKET_TYPE_ID, quantity: 1 }] };

// No database here: whatever is refused below is refused before reaching it.
describe("order endpoints: what is refused at the door", () => {
  let testApp: TestApp;
  let buyer: string;
  const limiter = new InMemoryRateLimiter();
  const server = () => testApp.app.getHttpServer();
  const post = (payload: object, headers: Record<string, string> = {}) =>
    request(server())
      .post("/api/v1/orders")
      .set({ Authorization: buyer, "Idempotency-Key": KEY, ...headers })
      .send(payload);

  function expectProblem(response: request.Response, type: ProblemType) {
    expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
  }

  beforeAll(async () => {
    testApp = await createTestApp({
      env: { TRUST_PROXY_HOPS: "1" },
      override: (builder) => builder.overrideProvider(RATE_LIMITER).useValue(limiter),
    });
    buyer = `Bearer ${
      testApp.app.get(AccessTokens).issue({ sub: USER_ID, role: "BUYER", sid: SESSION_ID }).token
    }`;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it("asks for a session", async () => {
    expectProblem(
      await request(server())
        .post("/api/v1/orders")
        .set("Idempotency-Key", KEY)
        .send(body)
        .expect(401),
      "unauthenticated",
    );
    expectProblem(
      await request(server()).get(`/api/v1/orders/${EVENT_ID}`).expect(401),
      "unauthenticated",
    );
  });

  it("asks for an Idempotency-Key that is a UUID", async () => {
    const missing = await request(server())
      .post("/api/v1/orders")
      .set("Authorization", buyer)
      .set("X-Forwarded-For", "203.0.113.10")
      .send(body)
      .expect(400);
    expectProblem(missing, "validation-failed");
    expect(problemDetailsSchema.parse(missing.body).errors).toEqual([
      { path: "Idempotency-Key", message: "envie um UUID por tentativa de compra" },
    ]);
    expectProblem(
      await post(body, {
        "Idempotency-Key": "tentativa-1",
        "X-Forwarded-For": "203.0.113.10",
      }).expect(400),
      "validation-failed",
    );
  });

  it.each([
    ["a price", { ...body, items: [{ ticketTypeId: TICKET_TYPE_ID, quantity: 1, priceCents: 1 }] }],
    ["a total", { ...body, totalCents: 1 }],
    ["a status", { ...body, status: "PAID" }],
    ["no items", { ...body, items: [] }],
    ["21 tickets of a type", { ...body, items: [{ ticketTypeId: TICKET_TYPE_ID, quantity: 21 }] }],
  ])("refuses a body with %s", async (_what, payload) => {
    expectProblem(
      await post(payload, { "X-Forwarded-For": "203.0.113.11" }).expect(400),
      "validation-failed",
    );
  });

  it("refuses a malformed order id", async () => {
    expectProblem(
      await request(server()).get("/api/v1/orders/123").set("Authorization", buyer).expect(400),
      "validation-failed",
    );
  });

  it("limits each IP to 30 orders a minute, before looking at the body", async () => {
    for (let i = 0; i < 30; i++) {
      await post({ items: [] }, { "X-Forwarded-For": "203.0.113.20" }).expect(400);
    }
    const limited = await post({ items: [] }, { "X-Forwarded-For": "203.0.113.20" }).expect(429);
    expectProblem(limited, "rate-limited");
    expect(limited.headers["retry-after"]).toBe("60");
    await post({ items: [] }, { "X-Forwarded-For": "203.0.113.21" }).expect(400);
  });
});
