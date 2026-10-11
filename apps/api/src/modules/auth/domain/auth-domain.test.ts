import { describe, expect, it } from "vitest";

import { LOCKOUT_THRESHOLD, lockSecondsAfter } from "./lockout-policy.js";
import { isLocked, newUser, toPublicUser } from "./user.js";
import {
  hashVerificationToken,
  issueVerificationToken,
  TOKEN_TTL_MS,
} from "./verification-token.js";

const now = new Date("2026-10-11T12:00:00Z");
const ids = {
  user: "0192a0e4-0000-7000-8000-0000000000aa",
  token: "0192a0e4-0000-7000-8000-0000000000bb",
};

describe("newUser", () => {
  const user = newUser({
    id: ids.user,
    name: "Ana Souza",
    email: "ana@exemplo.com",
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA",
    now,
  });

  it("starts as an unverified BUYER with a clean login record", () => {
    expect(user).toMatchObject({
      role: "BUYER",
      emailVerifiedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
    });
  });

  it("is immutable", () => {
    expect(Object.isFrozen(user)).toBe(true);
  });

  it("shows only public fields", () => {
    expect(toPublicUser(user)).toEqual({
      id: ids.user,
      name: "Ana Souza",
      email: "ana@exemplo.com",
      role: "BUYER",
      emailVerified: false,
    });
    expect(toPublicUser({ ...user, emailVerifiedAt: now }).emailVerified).toBe(true);
  });
});

describe("isLocked", () => {
  const base = newUser({ id: ids.user, name: "Ana", email: "a@b.co", passwordHash: "h", now });

  it("is locked only while lockedUntil is in the future", () => {
    expect(isLocked(base, now)).toBe(false);
    expect(isLocked({ ...base, lockedUntil: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(isLocked({ ...base, lockedUntil: now }, now)).toBe(false);
    expect(isLocked({ ...base, lockedUntil: new Date(now.getTime() - 1) }, now)).toBe(false);
  });
});

describe("lockSecondsAfter", () => {
  it("does not lock before the threshold", () => {
    for (let failures = 0; failures < LOCKOUT_THRESHOLD; failures++) {
      expect(lockSecondsAfter(failures)).toBe(0);
    }
  });

  it("locks for a minute on the fifth failure and doubles with each further one", () => {
    expect([5, 6, 7, 8].map(lockSecondsAfter)).toEqual([60, 120, 240, 480]);
  });

  it("never locks for more than an hour, however many failures pile up", () => {
    expect(lockSecondsAfter(12)).toBe(3_600);
    expect(lockSecondsAfter(1_000_000)).toBe(3_600);
  });
});

describe("issueVerificationToken", () => {
  const issue = () =>
    issueVerificationToken({
      id: ids.token,
      userId: ids.user,
      purpose: "EMAIL_VERIFICATION",
      now,
    });

  it("produces a 256-bit base64url secret", () => {
    expect(issue().secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats", () => {
    const secrets = new Set(Array.from({ length: 200 }, () => issue().secret));
    expect(secrets.size).toBe(200);
  });

  it("stores only the SHA-256 of the secret, which is not the secret", () => {
    const { secret, record } = issue();

    expect(record.tokenHash).toHaveLength(32);
    expect(record.tokenHash.equals(hashVerificationToken(secret))).toBe(true);
    expect(JSON.stringify(record)).not.toContain(secret);
  });

  it("expires after the lifetime of its purpose", () => {
    expect(issue().record.expiresAt.getTime() - now.getTime()).toBe(
      TOKEN_TTL_MS.EMAIL_VERIFICATION,
    );
    const reset = issueVerificationToken({
      id: ids.token,
      userId: ids.user,
      purpose: "PASSWORD_RESET",
      now,
    });
    expect(reset.record.expiresAt.getTime() - now.getTime()).toBe(30 * 60 * 1000);
  });
});
