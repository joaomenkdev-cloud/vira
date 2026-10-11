import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { RATE_LIMITER } from "../src/platform/rate-limit/rate-limiter.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";
import { FixturesModule } from "./support/fixtures.controller.js";
import { InMemoryRateLimiter } from "./support/in-memory-rate-limiter.js";

describe("rate limit guard", () => {
  let testApp: TestApp;
  const limiter = new InMemoryRateLimiter();
  const valid = { title: "Show", quantity: 1 };
  const post = (body: object, ip: string) =>
    request(testApp.app.getHttpServer())
      .post("/api/v1/__test/limited")
      .set("X-Forwarded-For", ip)
      .send(body);

  beforeAll(async () => {
    testApp = await createTestApp({
      env: { TRUST_PROXY_HOPS: "1" },
      imports: [FixturesModule],
      override: (builder) => builder.overrideProvider(RATE_LIMITER).useValue(limiter),
    });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it("describes the budget on every response it lets through", async () => {
    const response = await post(valid, "203.0.113.1").expect(201);

    expect(response.headers).toMatchObject({
      "ratelimit-limit": "2",
      "ratelimit-remaining": "1",
      "ratelimit-reset": "60",
    });
    expect(response.headers).not.toHaveProperty("retry-after");
  });

  it("answers 429 with Retry-After and RateLimit-* once the budget is spent", async () => {
    await post(valid, "203.0.113.2").expect(201);
    await post(valid, "203.0.113.2").expect(201);

    const response = await post(valid, "203.0.113.2").expect(429);

    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.headers).toMatchObject({
      "retry-after": "60",
      "ratelimit-limit": "2",
      "ratelimit-remaining": "0",
      "ratelimit-reset": "60",
    });
    const problem = problemDetailsSchema.parse(response.body);
    expect(problem.type).toBe(problemTypeUri("rate-limited"));
    expect(problem.status).toBe(429);
  });

  it("counts each client IP separately, as seen through the proxy", async () => {
    for (let i = 0; i < 3; i++) await post(valid, "203.0.113.3");

    await post(valid, "203.0.113.4").expect(201);
  });

  it("refuses before the body is validated: the flood costs nothing", async () => {
    await post(valid, "203.0.113.5").expect(201);
    await post(valid, "203.0.113.5").expect(201);

    // The body is invalid, yet the answer is 429, not 400: the guard ran first.
    await post({ title: "x" }, "203.0.113.5").expect(429);
  });
});
