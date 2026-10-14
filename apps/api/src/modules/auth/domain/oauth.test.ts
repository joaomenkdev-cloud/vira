import { describe, expect, it } from "vitest";

import {
  accountNameFrom,
  isSafeReturnPath,
  OAUTH_ATTEMPT_TTL_MS,
  pkceChallenge,
  startLoginAttempt,
} from "./oauth.js";
import { newSocialUser, toPublicUser } from "./user.js";

const now = new Date("2026-10-14T12:00:00Z");

describe("pkceChallenge", () => {
  it("matches the S256 example of RFC 7636 (appendix B)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("startLoginAttempt", () => {
  const attempt = startLoginAttempt({ provider: "google", returnTo: "/eventos", now });

  it("draws state, verifier and nonce independently, 256 bits each", () => {
    for (const secret of [attempt.state, attempt.codeVerifier, attempt.nonce]) {
      expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    expect(new Set([attempt.state, attempt.codeVerifier, attempt.nonce]).size).toBe(3);
    const other = startLoginAttempt({ provider: "google", returnTo: null, now });
    expect(other.state).not.toBe(attempt.state);
  });

  it("lasts ten minutes and remembers where to return", () => {
    expect(attempt.expiresAt.getTime() - now.getTime()).toBe(OAUTH_ATTEMPT_TTL_MS);
    expect(OAUTH_ATTEMPT_TTL_MS).toBe(10 * 60 * 1000);
    expect(attempt).toMatchObject({ provider: "google", returnTo: "/eventos" });
  });
});

describe("isSafeReturnPath", () => {
  it.each(["/", "/eventos", "/eventos/show-x?data=2026-10-20#ingressos", "/conta/sessoes"])(
    "accepts the page %s",
    (path) => {
      expect(isSafeReturnPath(path)).toBe(true);
    },
  );

  it.each([
    "",
    "eventos",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/eventos\\..\\x",
    "/ eventos",
    "/eventos\nSet-Cookie: x=y",
    "/eventos\u0000",
    "/évènements",
    `/${"a".repeat(512)}`,
  ])("refuses %j", (path) => {
    expect(isSafeReturnPath(path)).toBe(false);
  });
});

describe("accountNameFrom", () => {
  it("uses the provider's name, trimmed", () => {
    expect(accountNameFrom("  Ana Souza ", "ana@exemplo.com")).toBe("Ana Souza");
  });

  it("falls back to the e-mail's local part", () => {
    expect(accountNameFrom("   ", "ana.souza@exemplo.com")).toBe("ana.souza");
  });

  it("cuts long names to 120 code points without splitting characters", () => {
    const name = accountNameFrom("😀".repeat(200), "ana@exemplo.com");
    expect(Array.from(name)).toHaveLength(120);
    expect(name).toBe("😀".repeat(120));
  });
});

describe("newSocialUser", () => {
  const user = newSocialUser({
    id: "0192a0e4-0000-7000-8000-0000000000aa",
    name: "Ana Souza",
    email: "ana@exemplo.com",
    now,
  });

  it("starts as a verified BUYER without a password", () => {
    expect(user).toMatchObject({ role: "BUYER", passwordHash: null, emailVerifiedAt: now });
    expect(toPublicUser(user).emailVerified).toBe(true);
    expect(Object.isFrozen(user)).toBe(true);
  });
});
