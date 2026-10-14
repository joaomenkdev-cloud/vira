import type { Response } from "express";
import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import { FakeClock } from "../application/in-memory.fakes.js";
import { startLoginAttempt } from "../domain/oauth.js";
import { OAUTH_ATTEMPT_COOKIE, OAuthAttemptCookie } from "./oauth-attempt-cookie.js";

const configWith = (csrfSecret: string) => ({ auth: { csrfSecret } }) as unknown as AppConfig;

/** Captures what `write` puts in the response. */
function written(cookies: OAuthAttemptCookie, clock: FakeClock, returnTo: string | null = "/x") {
  const attempt = startLoginAttempt({ provider: "github", returnTo, now: clock.now() });
  let value = "";
  let options: Record<string, unknown> = {};
  const response = {
    cookie: (name: string, v: string, o: Record<string, unknown>) => {
      expect(name).toBe(OAUTH_ATTEMPT_COOKIE);
      value = v;
      options = o;
    },
  } as unknown as Response;
  cookies.write(response, attempt);
  return { attempt, value, options };
}

describe("OAuthAttemptCookie", () => {
  const clock = new FakeClock(new Date("2026-10-14T12:00:00Z"));
  const cookies = new OAuthAttemptCookie(configWith("k".repeat(44)), clock);

  it("reads back the attempt it wrote", () => {
    const { attempt, value } = written(cookies, clock);
    expect(cookies.read(value)).toEqual(attempt);
  });

  it("is HttpOnly, Secure, Lax, scoped to the OAuth routes and short-lived", () => {
    expect(written(cookies, clock).options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/v1/auth/oauth",
      maxAge: 10 * 60 * 1000,
    });
  });

  it("keeps the verifier and the nonce unreadable", () => {
    const { attempt, value } = written(cookies, clock);
    const raw = Buffer.from(value, "base64url").toString("latin1");
    for (const secret of [attempt.state, attempt.codeVerifier, attempt.nonce]) {
      expect(value).not.toContain(secret);
      expect(raw).not.toContain(secret);
    }
    expect(raw).not.toContain("codeVerifier");
  });

  it("refuses a cookie whose bytes were changed, cut or made up", () => {
    const { value } = written(cookies, clock);
    const raw = Buffer.from(value, "base64url");
    for (const index of [0, 12, 28, raw.length - 1]) {
      const altered = Buffer.from(raw);
      altered[index] = (altered[index] ?? 0) ^ 1;
      expect(cookies.read(altered.toString("base64url")), `byte ${index}`).toBeNull();
    }
    expect(cookies.read(raw.subarray(0, raw.length - 1).toString("base64url"))).toBeNull();
    expect(cookies.read(raw.subarray(0, 28).toString("base64url"))).toBeNull();
    expect(cookies.read("not-a-cookie")).toBeNull();
    expect(cookies.read("a".repeat(5000))).toBeNull();
    expect(cookies.read(undefined)).toBeNull();
  });

  it("refuses a cookie sealed with another key", () => {
    const other = new OAuthAttemptCookie(configWith("z".repeat(44)), clock);
    expect(other.read(written(cookies, clock).value)).toBeNull();
  });

  it("refuses an attempt after its ten minutes, even if the browser kept the cookie", () => {
    const local = new FakeClock(clock.now());
    const sealer = new OAuthAttemptCookie(configWith("k".repeat(44)), local);
    const { value } = written(sealer, local);
    local.advance(10 * 60 * 1000 - 1);
    expect(sealer.read(value)).not.toBeNull();
    local.advance(1);
    expect(sealer.read(value)).toBeNull();
  });
});
