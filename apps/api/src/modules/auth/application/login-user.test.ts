import { beforeEach, describe, expect, it } from "vitest";

import { RateLimitExceededError } from "../../../platform/rate-limit/rate-limiter.js";
import { newUser } from "../domain/user.js";
import { EmailNotVerifiedError, InvalidCredentialsError } from "./errors.js";
import {
  createRecorders,
  FakeClock,
  FakeIds,
  FakePasswordHasher,
  FakeRateLimiter,
  InMemoryUserRepository,
} from "./in-memory.fakes.js";
import { LoginUser } from "./login-user.js";

const PASSWORD = "correct horse battery";
const email = "ana@exemplo.com";

async function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const limiter = new FakeRateLimiter();
  const recorders = createRecorders(clock, ids);
  const login = new LoginUser(users, hasher, limiter, clock, recorders.audit);

  const base = newUser({
    id: ids.next(),
    name: "Ana Souza",
    email,
    passwordHash: await hasher.hash(PASSWORD),
    now: clock.current,
  });
  const user = { ...base, emailVerifiedAt: clock.current };
  users.users.set(user.id, user);
  hasher.hashCalls = 0;

  const fail = async (password = "wrong password", mail = email) => {
    limiter.reset();
    return login.execute({ email: mail, password }).catch((error: unknown) => error);
  };
  return { clock, users, hasher, limiter, login, user, fail, ...recorders };
}

describe("LoginUser", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  describe("a correct login", () => {
    it("answers with the public user, nothing secret", async () => {
      const user = await s.login.execute({ email, password: PASSWORD });

      expect(user).toEqual({
        id: s.user.id,
        name: "Ana Souza",
        email,
        role: "BUYER",
        emailVerified: true,
      });
      expect(JSON.stringify(user)).not.toContain("argon2");
    });

    it("is audited as the user, with the method and the request id", async () => {
      await s.login.execute({ email, password: PASSWORD }, { requestId: "req-12345678" });

      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.login_succeeded",
          actorId: s.user.id,
          entityId: s.user.id,
          requestId: "req-12345678",
          metadata: { method: "password" },
        }),
      ]);
    });

    it("clears earlier failures", async () => {
      await s.fail();
      await s.fail();
      expect(s.users.get(s.user.id).failedLoginCount).toBe(2);

      s.limiter.reset();
      await s.login.execute({ email, password: PASSWORD });

      expect(s.users.get(s.user.id).failedLoginCount).toBe(0);
    });
  });

  describe("refusals that must look alike", () => {
    it("treats a wrong password and an unknown e-mail as the same error", async () => {
      const wrongPassword = await s.fail("wrong password");
      const unknownEmail = await s.fail(PASSWORD, "ninguem@exemplo.com");

      expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
      expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
      expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
    });

    it("spends one hash verification either way, so the timing does not tell them apart", async () => {
      await s.fail("wrong password");
      await s.fail(PASSWORD, "ninguem@exemplo.com");

      // Two attempts, two verifications; the unknown account is checked against `null`.
      expect(s.hasher.verifyTargets).toHaveLength(2);
      expect(s.hasher.verifyTargets[1]).toBeNull();
    });

    it("refuses an account that has no password (social login only)", async () => {
      s.users.users.set(s.user.id, { ...s.user, passwordHash: null });

      expect(await s.fail(PASSWORD)).toBeInstanceOf(InvalidCredentialsError);
    });

    it("audits an unknown e-mail without an entity, and a wrong password with one", async () => {
      await s.fail(PASSWORD, "ninguem@exemplo.com");
      await s.fail("wrong password");

      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.login_failed",
          actorId: null,
          entityId: null,
          metadata: { reason: "invalid_credentials" },
        }),
        expect.objectContaining({
          action: "auth.login_failed",
          actorId: null,
          entityId: s.user.id,
          metadata: { reason: "invalid_credentials" },
        }),
      ]);
      expect(JSON.stringify(s.auditEntries)).not.toContain(email);
    });
  });

  describe("an unverified e-mail", () => {
    beforeEach(() => {
      s.users.users.set(s.user.id, { ...s.user, emailVerifiedAt: null });
    });

    it("is revealed only to someone who knows the password", async () => {
      expect(await s.fail(PASSWORD)).toBeInstanceOf(EmailNotVerifiedError);
      expect(await s.fail("wrong password")).toBeInstanceOf(InvalidCredentialsError);
    });

    it("is audited as such", async () => {
      await s.fail(PASSWORD);

      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.login_failed",
          entityId: s.user.id,
          metadata: { reason: "email_not_verified" },
        }),
      ]);
    });
  });

  describe("progressive lockout", () => {
    it("locks the account on the fifth failure in a row, for a minute", async () => {
      for (let i = 0; i < 4; i++) await s.fail();
      expect(s.users.get(s.user.id).lockedUntil).toBeNull();

      await s.fail();

      expect(s.users.get(s.user.id)).toMatchObject({
        failedLoginCount: 5,
        lockedUntil: new Date(s.clock.current.getTime() + 60_000),
      });
      expect(s.auditEntries.filter((e) => e["action"] === "auth.account_locked")).toEqual([
        expect.objectContaining({
          actorId: null,
          entityId: s.user.id,
          metadata: { failedAttempts: 5, lockSeconds: 60 },
        }),
      ]);
    });

    it("refuses even the right password while locked, as a plain invalid-credentials", async () => {
      for (let i = 0; i < 5; i++) await s.fail();
      s.hasher.verifyTargets.length = 0;

      const refusal = await s.fail(PASSWORD);

      expect(refusal).toBeInstanceOf(InvalidCredentialsError);
      // The password is not even compared with the real hash, yet a full verification runs.
      expect(s.hasher.verifyTargets).toEqual([null]);
      expect(s.auditEntries.at(-1)).toMatchObject({
        action: "auth.login_failed",
        metadata: { reason: "locked" },
      });
    });

    it("does not count attempts made during the lock, so it cannot be extended from outside", async () => {
      for (let i = 0; i < 5; i++) await s.fail();
      const lockedUntil = s.users.get(s.user.id).lockedUntil;

      await s.fail();
      await s.fail();

      expect(s.users.get(s.user.id)).toMatchObject({ failedLoginCount: 5, lockedUntil });
    });

    it("lets the right password in again once the lock has expired, and resets the count", async () => {
      for (let i = 0; i < 5; i++) await s.fail();
      s.clock.advance(60_000);
      s.limiter.reset();

      await expect(s.login.execute({ email, password: PASSWORD })).resolves.toMatchObject({
        id: s.user.id,
      });

      expect(s.users.get(s.user.id)).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
    });

    it("locks for twice as long when a failure follows an expired lock", async () => {
      for (let i = 0; i < 5; i++) await s.fail();
      s.clock.advance(60_000);

      await s.fail();

      expect(s.users.get(s.user.id)).toMatchObject({
        failedLoginCount: 6,
        lockedUntil: new Date(s.clock.current.getTime() + 120_000),
      });
    });
  });

  describe("rate limit per account", () => {
    it("refuses the sixth attempt in the window before the password is looked at", async () => {
      for (let i = 0; i < 5; i++) {
        await s.login.execute({ email, password: "wrong password" }).catch(() => undefined);
      }
      s.hasher.verifyTargets.length = 0;

      const refusal = await s.login
        .execute({ email, password: PASSWORD })
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(RateLimitExceededError);
      expect((refusal as RateLimitExceededError).result).toMatchObject({
        allowed: false,
        limit: 5,
        remaining: 0,
      });
      expect(s.hasher.verifyTargets).toEqual([]);
    });

    it("applies to an unknown e-mail exactly as to a known one", async () => {
      for (let i = 0; i < 5; i++) {
        await s.login
          .execute({ email: "ninguem@exemplo.com", password: "x" })
          .catch(() => undefined);
      }

      const refusal = await s.login
        .execute({ email: "ninguem@exemplo.com", password: "x" })
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(RateLimitExceededError);
    });

    it("keys the budget by the e-mail and spends it before any hash", async () => {
      await s.login.execute({ email, password: PASSWORD });

      expect(s.limiter.hits).toEqual([{ rule: "auth.login.account", subject: email }]);
    });
  });
});
