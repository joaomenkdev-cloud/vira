import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { OAUTH_PROVIDERS } from "@vira/shared";
import type { CookieOptions, Response } from "express";
import { z } from "zod";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { OAUTH_ATTEMPT_TTL_MS, type OAuthAttempt } from "../domain/oauth.js";

/**
 * The secrets of a social login attempt (`state`, PKCE verifier, nonce) wait in this
 * cookie while the person is at the provider. It goes only to the OAuth routes,
 * `HttpOnly` and `SameSite=Lax`: the provider's redirect back is a top-level GET
 * navigation, which Lax cookies accompany, and a page script never sees it.
 */
export const OAUTH_ATTEMPT_COOKIE = "__Secure-vira_oauth";
/** Must match the global prefix (`api/v1`) and the controller path (`auth/oauth`). */
export const OAUTH_ATTEMPT_COOKIE_PATH = "/api/v1/auth/oauth";

const OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: OAUTH_ATTEMPT_COOKIE_PATH,
};

const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const payloadSchema = z.strictObject({
  provider: z.enum(OAUTH_PROVIDERS),
  state: secret,
  codeVerifier: secret,
  nonce: secret,
  returnTo: z.string().max(512).nullable(),
  expiresAt: z.number().int(),
});

/**
 * Seals attempts with an HMAC, so the server keeps no state and nobody can hand the
 * callback an attempt of their making or stretch one past its ten minutes. The key is
 * derived from `CSRF_SECRET` with HKDF under its own label: one secret to configure,
 * and still a different key for each purpose.
 */
@Injectable()
export class OAuthAttemptCookie {
  private readonly key: Buffer;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = Buffer.from(
      hkdfSync("sha256", config.auth.csrfSecret, "", "vira oauth attempt cookie", 32),
    );
  }

  write(response: Response, attempt: OAuthAttempt): void {
    const payload = Buffer.from(
      JSON.stringify({ ...attempt, expiresAt: attempt.expiresAt.getTime() }),
    ).toString("base64url");
    response.cookie(OAUTH_ATTEMPT_COOKIE, `${payload}.${this.mac(payload)}`, {
      ...OPTIONS,
      maxAge: OAUTH_ATTEMPT_TTL_MS,
    });
  }

  /** The attempt, if the cookie is ours, unaltered and not expired. */
  read(value: string | undefined): OAuthAttempt | null {
    if (value === undefined) return null;
    const separator = value.lastIndexOf(".");
    if (separator === -1) return null;
    const payload = value.slice(0, separator);
    const sent = Buffer.from(value.slice(separator + 1), "base64url");
    const expected = Buffer.from(this.mac(payload), "base64url");
    if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return null;

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    const parsed = payloadSchema.safeParse(decoded);
    if (!parsed.success || parsed.data.expiresAt <= this.clock.now().getTime()) return null;
    return { ...parsed.data, expiresAt: new Date(parsed.data.expiresAt) };
  }

  /** Each attempt is good for one callback. */
  clear(response: Response): void {
    response.clearCookie(OAUTH_ATTEMPT_COOKIE, OPTIONS);
  }

  private mac(payload: string): string {
    return createHmac("sha256", this.key).update(payload).digest("base64url");
  }
}
