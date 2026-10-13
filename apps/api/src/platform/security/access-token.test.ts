import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { AppConfig } from "../config/config.schema.js";
import { ACCESS_TOKEN_TTL_SECONDS, AccessTokens } from "./access-token.js";

const SECRET = "k".repeat(43);
const subject = {
  sub: "0192a7c0-0000-7000-8000-000000000001",
  role: "BUYER",
  sid: "0192a7c0-0000-7000-8000-0000000000aa",
} as const;

const clock = { current: new Date("2026-10-13T12:00:00Z"), now: () => clock.current };

function tokensWith(secret = SECRET): AccessTokens {
  return new AccessTokens({ auth: { jwtSecret: secret } } as AppConfig, clock);
}

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A token with any header and claims, signed (HS256) with `secret`. */
function forge(header: object, claims: object, secret = SECRET): string {
  const input = `${b64(header)}.${b64(claims)}`;
  return `${input}.${createHmac("sha256", secret).update(input).digest("base64url")}`;
}

function validClaims(overrides: object = {}) {
  const iat = Math.floor(clock.current.getTime() / 1000);
  return { ...subject, iss: "vira-api", aud: "vira", iat, exp: iat + 600, ...overrides };
}

describe("AccessTokens", () => {
  it("round-trips the subject and expires after ten minutes", () => {
    const tokens = tokensWith();
    const issued = tokens.issue(subject);

    expect(issued.expiresAt.getTime() - clock.current.getTime()).toBe(
      ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    expect(tokens.verify(issued.token)).toEqual(subject);
  });

  it("refuses a token at and after its expiry", () => {
    const tokens = tokensWith();
    const issued = tokens.issue(subject);
    const start = clock.current;
    try {
      clock.current = new Date(issued.expiresAt.getTime() - 1000);
      expect(tokens.verify(issued.token)).toEqual(subject);
      clock.current = issued.expiresAt;
      expect(tokens.verify(issued.token)).toBeNull();
    } finally {
      clock.current = start;
    }
  });

  it("accepts a well-formed token signed with the same key", () => {
    expect(tokensWith().verify(forge({ alg: "HS256", typ: "JWT" }, validClaims()))).toEqual(
      subject,
    );
  });

  it('refuses "alg: none" and any other algorithm in the header', () => {
    const claims = validClaims();
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`;
    expect(tokensWith().verify(unsigned)).toBeNull();
    for (const alg of ["none", "HS512", "RS256", "hs256"]) {
      expect(tokensWith().verify(forge({ alg, typ: "JWT" }, claims))).toBeNull();
    }
    expect(tokensWith().verify(forge({ typ: "JWT", alg: "HS256" }, claims))).toBeNull();
  });

  it("refuses a token signed with another key or with a swapped signature", () => {
    expect(
      tokensWith().verify(forge({ alg: "HS256", typ: "JWT" }, validClaims(), "x".repeat(43))),
    ).toBeNull();

    const tokens = tokensWith();
    const [header, payload, signature] = tokens.issue(subject).token.split(".");
    const other = tokens.issue({ ...subject, role: "ADMIN" }).token.split(".");
    expect(tokens.verify(`${header}.${other[1]}.${signature}`)).toBeNull();
    expect(tokens.verify(`${header}.${payload}.${other[2]}`)).toBeNull();
    expect(tokens.verify(`${header}.${payload}.${signature}x`)).toBeNull();
    expect(tokens.verify(`${header}.${payload}.`)).toBeNull();
  });

  it("refuses the wrong issuer or audience, a token from the future and missing claims", () => {
    const tokens = tokensWith();
    const header = { alg: "HS256", typ: "JWT" };
    const iat = Math.floor(clock.current.getTime() / 1000);
    for (const claims of [
      validClaims({ iss: "someone-else" }),
      validClaims({ aud: "another-app" }),
      validClaims({ iat: iat + 120, exp: iat + 720 }),
      validClaims({ role: "ROOT" }),
      validClaims({ sid: "not-a-uuid" }),
      { ...validClaims(), exp: undefined },
    ]) {
      expect(tokens.verify(forge(header, claims))).toBeNull();
    }
  });

  it("refuses garbage without throwing", () => {
    const tokens = tokensWith();
    for (const garbage of ["", "a", "a.b", "a.b.c.d", "...", "é.é.é", "x".repeat(5000)]) {
      expect(tokens.verify(garbage)).toBeNull();
    }
    const header = b64({ alg: "HS256", typ: "JWT" });
    const notJson = Buffer.from("{not json").toString("base64url");
    const input = `${header}.${notJson}`;
    const signature = createHmac("sha256", SECRET).update(input).digest("base64url");
    expect(tokens.verify(`${input}.${signature}`)).toBeNull();
  });
});
