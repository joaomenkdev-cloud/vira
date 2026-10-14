import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { OAUTH_PROVIDERS } from "@vira/shared";
import type { Response } from "express";
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

/** AES-256-GCM: 96-bit random IV, 128-bit tag; the cookie name is bound as associated data. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD = Buffer.from(OAUTH_ATTEMPT_COOKIE);
/** Far above a real attempt (about 400 characters); anything longer is not ours. */
const MAX_COOKIE_LENGTH = 2048;

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
 * Seals attempts with AES-256-GCM, so the server keeps no state, nobody can hand the
 * callback an attempt of their making or stretch one past its ten minutes, and the
 * verifier and nonce are unreadable to anything that sees the cookie (an extension,
 * a log). The key is derived from `CSRF_SECRET` with HKDF under its own label: one
 * secret to configure, and still a different key for each purpose.
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
    const plaintext = JSON.stringify({ ...attempt, expiresAt: attempt.expiresAt.getTime() });
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv).setAAD(AAD);
    const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const value = Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString("base64url");
    response.cookie(OAUTH_ATTEMPT_COOKIE, value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: OAUTH_ATTEMPT_COOKIE_PATH,
      maxAge: OAUTH_ATTEMPT_TTL_MS,
    });
  }

  /** The attempt, if the cookie is ours, unaltered and not expired. */
  read(value: string | undefined): OAuthAttempt | null {
    if (value === undefined || value.length > MAX_COOKIE_LENGTH) return null;
    const raw = Buffer.from(value, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) return null;

    let decoded: unknown;
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, IV_BYTES))
        .setAAD(AAD)
        .setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const plaintext = Buffer.concat([
        decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]);
      decoded = JSON.parse(plaintext.toString("utf8"));
    } catch {
      // Wrong key, altered bytes (the tag does not match) or not ours at all.
      return null;
    }
    const parsed = payloadSchema.safeParse(decoded);
    if (!parsed.success || parsed.data.expiresAt <= this.clock.now().getTime()) return null;
    return { ...parsed.data, expiresAt: new Date(parsed.data.expiresAt) };
  }

  /** Each attempt is good for one callback. */
  clear(response: Response): void {
    response.clearCookie(OAUTH_ATTEMPT_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: OAUTH_ATTEMPT_COOKIE_PATH,
    });
  }
}
