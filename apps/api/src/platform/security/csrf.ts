import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";

export const CSRF_HEADER = "x-csrf-token";

const NONCE_BYTES = 16;
const TOKEN_PATTERN = /^([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

/**
 * Signed double-submit tokens (ADR-0005, OWASP CSRF cheat sheet): `<nonce>.<mac>`,
 * where the MAC is an HMAC of the session id and the nonce. The same value goes in a
 * cookie and, from the page, in the `X-CSRF-Token` header. A token is only valid for
 * the session it was issued to, so a token planted by someone else (or one from an
 * earlier login) does not work, and the server keeps no state for it.
 */
@Injectable()
export class CsrfTokens {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(config.auth.csrfSecret, "utf8");
  }

  issue(sessionId: string): string {
    const nonce = randomBytes(NONCE_BYTES).toString("base64url");
    return `${nonce}.${this.mac(sessionId, nonce).toString("base64url")}`;
  }

  verify(token: string, sessionId: string): boolean {
    const match = TOKEN_PATTERN.exec(token);
    if (!match) return false;
    const [, nonce, mac] = match as unknown as [string, string, string];
    return timingSafeEqual(Buffer.from(mac, "base64url"), this.mac(sessionId, nonce));
  }

  private mac(sessionId: string, nonce: string): Buffer {
    return createHmac("sha256", this.key).update(`${sessionId}.${nonce}`).digest();
  }
}

/** Constant-time comparison of the cookie and header copies of a token. */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
