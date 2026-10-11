import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PASSWORD_HASHER } from "../src/modules/auth/application/ports/password-hasher.js";
import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { RATE_LIMITER } from "../src/platform/rate-limit/rate-limiter.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";
import { InMemoryRateLimiter } from "./support/in-memory-rate-limiter.js";

/** Counts how often a password reached the hasher: the expensive, abusable step. */
class CountingHasher {
  hashCalls = 0;
  verifyCalls = 0;
  hash(): Promise<string> {
    this.hashCalls++;
    return Promise.resolve("$argon2id$counted");
  }
  verify(): Promise<boolean> {
    this.verifyCalls++;
    return Promise.resolve(false);
  }
}

// No database or Redis here: whatever is refused below is refused before reaching them.
describe("authentication endpoints: what is refused at the door", () => {
  let testApp: TestApp;
  const hasher = new CountingHasher();
  const limiter = new InMemoryRateLimiter();
  const valid = { name: "Ana Souza", email: "ana@exemplo.com", password: "correct horse battery" };
  const post = (path: string, body: object, ip = "203.0.113.10") =>
    request(testApp.app.getHttpServer())
      .post(`/api/v1/auth/${path}`)
      .set("X-Forwarded-For", ip)
      .send(body);

  beforeAll(async () => {
    testApp = await createTestApp({
      env: { TRUST_PROXY_HOPS: "1" },
      override: (builder) =>
        builder
          .overrideProvider(PASSWORD_HASHER)
          .useValue(hasher)
          .overrideProvider(RATE_LIMITER)
          .useValue(limiter),
    });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it("answers 400 to a gigantic password without hashing anything", async () => {
    const giant = "a".repeat(50_000);

    const register = await post("register", { ...valid, password: giant }, "203.0.113.11").expect(
      400,
    );
    const login = await post(
      "login",
      { email: valid.email, password: giant },
      "203.0.113.12",
    ).expect(400);

    for (const response of [register, login]) {
      const problem = problemDetailsSchema.parse(response.body);
      expect(problem.type).toBe(problemTypeUri("validation-failed"));
      expect(problem.errors?.map((e) => e.path)).toEqual(["password"]);
    }
    expect(hasher.hashCalls).toBe(0);
    expect(hasher.verifyCalls).toBe(0);
  });

  it("rejects a new password shorter than the policy allows", async () => {
    const response = await post("register", { ...valid, password: "short" }, "203.0.113.13").expect(
      400,
    );
    expect(problemDetailsSchema.parse(response.body).errors?.map((e) => e.path)).toEqual([
      "password",
    ]);
    expect(hasher.hashCalls).toBe(0);
  });

  it("never lets a client choose its role: unknown fields are a 400", async () => {
    for (const extra of [{ role: "ADMIN" }, { emailVerified: true }, { id: "x" }]) {
      const response = await post("register", { ...valid, ...extra }, "203.0.113.14").expect(400);
      expect(problemDetailsSchema.parse(response.body).type).toBe(
        problemTypeUri("validation-failed"),
      );
    }
    expect(hasher.hashCalls).toBe(0);
  });

  it("refuses malformed e-mails, tokens and empty bodies", async () => {
    await post("register", { ...valid, email: "not-an-email" }, "203.0.113.15").expect(400);
    await post("register", { ...valid, name: "   " }, "203.0.113.15").expect(400);
    await post("login", { email: valid.email }, "203.0.113.15").expect(400);
    await post("email/verify", { token: "too-short" }, "203.0.113.15").expect(400);
    await post("email/verify", {}, "203.0.113.15").expect(400);
  });

  it("limits each endpoint per IP before looking at the body", async () => {
    // Five bad requests from one address use up the register budget (5 per hour)...
    for (let i = 0; i < 5; i++) await post("register", {}, "203.0.113.20").expect(400);

    // ...so the sixth is refused as rate-limited, not as invalid.
    const response = await post("register", {}, "203.0.113.20").expect(429);

    expect(response.headers).toMatchObject({
      "retry-after": "3600",
      "ratelimit-limit": "5",
      "ratelimit-remaining": "0",
    });
    expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri("rate-limited"));
    // Another address is unaffected.
    await post("register", {}, "203.0.113.21").expect(400);
  });

  it("uses the budgets of docs/API.md: 10 verifications per hour, 10 logins per 15 minutes", async () => {
    for (let i = 0; i < 10; i++) await post("email/verify", {}, "203.0.113.30").expect(400);
    const verify = await post("email/verify", {}, "203.0.113.30").expect(429);
    expect(verify.headers).toMatchObject({ "ratelimit-limit": "10", "retry-after": "3600" });

    for (let i = 0; i < 10; i++) await post("login", {}, "203.0.113.31").expect(400);
    const login = await post("login", {}, "203.0.113.31").expect(429);
    expect(login.headers).toMatchObject({ "ratelimit-limit": "10", "retry-after": "900" });
  });

  it("documents the three routes in the OpenAPI document", async () => {
    const response = await request(testApp.app.getHttpServer()).get("/docs/json").expect(200);
    const paths = Object.keys((response.body as { paths: object }).paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/auth/register",
        "/api/v1/auth/email/verify",
        "/api/v1/auth/login",
      ]),
    );
  });
});
