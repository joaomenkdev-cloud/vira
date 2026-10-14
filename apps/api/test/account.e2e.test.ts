import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { BREACHED_PASSWORDS } from "../src/modules/auth/application/ports/breached-passwords.js";
import { PASSWORD_HASHER } from "../src/modules/auth/application/ports/password-hasher.js";
import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { RATE_LIMITER } from "../src/platform/rate-limit/rate-limiter.js";
import { AccessTokens } from "../src/platform/security/access-token.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";
import { InMemoryRateLimiter } from "./support/in-memory-rate-limiter.js";

const USER_ID = "0192a0e4-0000-7000-8000-000000000001";
const SESSION_ID = "0192a0e4-0000-7000-8000-0000000000aa";
const TOKEN = "a".repeat(43);

/** Counts how often a password reached the hasher: the expensive, abusable step. */
class CountingHasher {
  calls = 0;
  hash(): Promise<string> {
    this.calls++;
    return Promise.resolve("$argon2id$counted");
  }
  verify(): Promise<boolean> {
    this.calls++;
    return Promise.resolve(false);
  }
}

/** Every password is leaked here, and each check is counted. */
class EverythingLeaked {
  checks = 0;
  includes(): Promise<boolean> {
    this.checks++;
    return Promise.resolve(true);
  }
}

// No database or Redis here: whatever is refused below is refused before reaching them.
describe("account and password reset endpoints: what is refused at the door", () => {
  let testApp: TestApp;
  const hasher = new CountingHasher();
  const breached = new EverythingLeaked();
  const limiter = new InMemoryRateLimiter();
  let bearer: string;
  const server = () => testApp.app.getHttpServer();

  beforeAll(async () => {
    testApp = await createTestApp({
      env: { TRUST_PROXY_HOPS: "1" },
      override: (builder) =>
        builder
          .overrideProvider(PASSWORD_HASHER)
          .useValue(hasher)
          .overrideProvider(RATE_LIMITER)
          .useValue(limiter)
          .overrideProvider(BREACHED_PASSWORDS)
          .useValue(breached),
    });
    bearer = `Bearer ${
      testApp.app.get(AccessTokens).issue({ sub: USER_ID, role: "BUYER", sid: SESSION_ID }).token
    }`;
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(() => {
    hasher.calls = 0;
    breached.checks = 0;
  });

  describe("without a session", () => {
    it.each([
      ["GET", "/api/v1/me"],
      ["PATCH", "/api/v1/me"],
      ["POST", "/api/v1/me/password"],
      ["POST", "/api/v1/me/email"],
      ["POST", "/api/v1/me/organizer"],
    ])("%s %s answers 401", async (method, path) => {
      const response = await request(server())
        [method.toLowerCase() as "get" | "patch" | "post"](path)
        .send({})
        .expect(401);
      expect(problemDetailsSchema.parse(response.body).type).toBe(
        problemTypeUri("unauthenticated"),
      );
    });
  });

  describe("mass assignment (OWASP API3): unknown fields are 400, never applied", () => {
    it.each([
      ["PATCH", "/api/v1/me", { name: "Ana", role: "ADMIN" }],
      ["PATCH", "/api/v1/me", { name: "Ana", email: "outro@exemplo.com" }],
      ["PATCH", "/api/v1/me", { name: "Ana", emailVerified: true }],
      ["PATCH", "/api/v1/me", { name: "Ana", passwordHash: "$argon2id$x" }],
      ["PATCH", "/api/v1/me", { name: "Ana", id: "0192a0e4-0000-7000-8000-000000000002" }],
      ["POST", "/api/v1/me/organizer", { displayName: "Coletivo", role: "ADMIN" }],
      ["POST", "/api/v1/me/organizer", { displayName: "Coletivo", slug: "outro" }],
      ["POST", "/api/v1/me/organizer", { displayName: "Coletivo", userId: USER_ID }],
      [
        "POST",
        "/api/v1/me/password",
        { currentPassword: "x", newPassword: "long enough!", userId: USER_ID },
      ],
      ["POST", "/api/v1/me/email", { email: "n@exemplo.com", currentPassword: "x", role: "ADMIN" }],
    ])("%s %s %j", async (method, path, body) => {
      const response = await request(server())
        [method.toLowerCase() as "patch" | "post"](path)
        .set("Authorization", bearer)
        .send(body)
        .expect(400);
      expect(problemDetailsSchema.parse(response.body).type).toBe(
        problemTypeUri("validation-failed"),
      );
      expect(hasher.calls).toBe(0);
    });

    it("refuses a role in the reset and forgot bodies too", async () => {
      await request(server())
        .post("/api/v1/auth/password/reset")
        .set("X-Forwarded-For", "203.0.113.20")
        .send({ token: TOKEN, password: "long enough!", role: "ADMIN" })
        .expect(400);
      await request(server())
        .post("/api/v1/auth/password/forgot")
        .set("X-Forwarded-For", "203.0.113.20")
        .send({ email: "ana@exemplo.com", role: "ADMIN" })
        .expect(400);
    });
  });

  describe("validation before any work", () => {
    it("refuses a short new password without checking or hashing it", async () => {
      await request(server())
        .post("/api/v1/me/password")
        .set("Authorization", bearer)
        .send({ currentPassword: "x", newPassword: "short" })
        .expect(400);
      await request(server())
        .post("/api/v1/auth/password/reset")
        .set("X-Forwarded-For", "203.0.113.21")
        .send({ token: TOKEN, password: "short" })
        .expect(400);
      expect(breached.checks).toBe(0);
      expect(hasher.calls).toBe(0);
    });

    it("refuses a gigantic password without checking or hashing it", async () => {
      await request(server())
        .post("/api/v1/auth/password/reset")
        .set("X-Forwarded-For", "203.0.113.22")
        .send({ token: TOKEN, password: "a".repeat(50_000) })
        .expect(400);
      expect(breached.checks).toBe(0);
      expect(hasher.calls).toBe(0);
    });

    it("refuses a malformed token", async () => {
      await request(server())
        .post("/api/v1/auth/password/reset")
        .set("X-Forwarded-For", "203.0.113.23")
        .send({ token: "not-a-token", password: "long enough!" })
        .expect(400);
      await request(server())
        .post("/api/v1/auth/email/change/confirm")
        .set("X-Forwarded-For", "203.0.113.23")
        .send({ token: "../../etc" })
        .expect(400);
    });
  });

  it("refuses a leaked password on sign-up with breached-password, before hashing", async () => {
    const response = await request(server())
      .post("/api/v1/auth/register")
      .set("X-Forwarded-For", "203.0.113.24")
      .send({ name: "Ana", email: "ana@exemplo.com", password: "correct horse battery" })
      .expect(400);
    const problem = problemDetailsSchema.parse(response.body);
    expect(problem.type).toBe(problemTypeUri("breached-password"));
    expect(problem.errors).toEqual([{ path: "password", message: expect.any(String) as string }]);
    expect(hasher.calls).toBe(0);
  });

  it("refuses a leaked password on reset with breached-password, before touching the token", async () => {
    const response = await request(server())
      .post("/api/v1/auth/password/reset")
      .set("X-Forwarded-For", "203.0.113.25")
      .send({ token: TOKEN, password: "correct horse battery" })
      .expect(400);
    expect(problemDetailsSchema.parse(response.body).type).toBe(
      problemTypeUri("breached-password"),
    );
  });

  describe("rate limits", () => {
    it("allows five forgot-password requests an hour per address of origin", async () => {
      const forgot = () =>
        request(server())
          .post("/api/v1/auth/password/forgot")
          .set("X-Forwarded-For", "203.0.113.30")
          .send({ email: "" }); // refused by validation, after the budget is spent
      for (let i = 0; i < 5; i++) await forgot().expect(400);
      const blocked = await forgot().expect(429);
      expect(blocked.headers["retry-after"]).toBeDefined();
    });

    it("allows ten reset attempts an hour per address of origin", async () => {
      const reset = () =>
        request(server())
          .post("/api/v1/auth/password/reset")
          .set("X-Forwarded-For", "203.0.113.31")
          .send({});
      for (let i = 0; i < 10; i++) await reset().expect(400);
      await reset().expect(429);
    });
  });
});
