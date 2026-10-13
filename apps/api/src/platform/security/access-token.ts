import { createHmac, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ROLES, type Role } from "@vira/shared";
import { z } from "zod";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";
import { CLOCK, type Clock } from "../runtime/runtime.js";

/** Lifetime of an access token (ADR-0005): revocation takes effect within this window. */
export const ACCESS_TOKEN_TTL_SECONDS = 10 * 60;

export const ACCESS_TOKEN_ISSUER = "vira-api";
export const ACCESS_TOKEN_AUDIENCE = "vira";

/** Far above any token we issue; anything longer is refused before it is hashed. */
const MAX_TOKEN_LENGTH = 1024;
/** Tolerated difference between our clock and the one that issued the token. */
const CLOCK_SKEW_SECONDS = 30;

/** The only header we issue and the only one we accept: the algorithm is never negotiated. */
const HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** What the API needs to know about the caller, without a database query. */
export interface AccessTokenSubject {
  /** User id. */
  readonly sub: string;
  readonly role: Role;
  /** Session id: the refresh-token family this access token was issued from. */
  readonly sid: string;
}

const claimsSchema = z.object({
  sub: z.uuid(),
  role: z.enum(ROLES),
  sid: z.uuid(),
  iss: z.literal(ACCESS_TOKEN_ISSUER),
  aud: z.literal(ACCESS_TOKEN_AUDIENCE),
  iat: z.number().int(),
  exp: z.number().int(),
});

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Short-lived HS256 JWTs (ADR-0005, docs/SECURITY_MODEL.md 3.1). Written against
 * `node:crypto` rather than a JWT library so the accepted surface is exactly this:
 * one fixed header (no `alg: none`, no algorithm confusion), our issuer and audience,
 * and an expiry that is always checked.
 */
@Injectable()
export class AccessTokens {
  private readonly key: Buffer;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = Buffer.from(config.auth.jwtSecret, "utf8");
  }

  issue(subject: AccessTokenSubject): IssuedAccessToken {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + ACCESS_TOKEN_TTL_SECONDS;
    const payload = Buffer.from(
      JSON.stringify({
        sub: subject.sub,
        role: subject.role,
        sid: subject.sid,
        iss: ACCESS_TOKEN_ISSUER,
        aud: ACCESS_TOKEN_AUDIENCE,
        iat,
        exp,
      }),
    ).toString("base64url");
    const signingInput = `${HEADER}.${payload}`;
    return {
      token: `${signingInput}.${this.sign(signingInput).toString("base64url")}`,
      expiresAt: new Date(exp * 1000),
    };
  }

  /** The subject of a valid token; `null` for anything else, whatever the reason. */
  verify(token: string): AccessTokenSubject | null {
    if (token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts as [string, string, string];
    if (header !== HEADER || !BASE64URL.test(payload) || !BASE64URL.test(signature)) return null;

    const expected = this.sign(`${header}.${payload}`);
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      return null;
    }
    const claims = claimsSchema.safeParse(decoded);
    if (!claims.success) return null;

    const now = Math.floor(this.clock.now().getTime() / 1000);
    if (claims.data.exp <= now) return null;
    if (claims.data.iat > now + CLOCK_SKEW_SECONDS) return null;

    return { sub: claims.data.sub, role: claims.data.role, sid: claims.data.sid };
  }

  private sign(input: string): Buffer {
    return createHmac("sha256", this.key).update(input).digest();
  }
}
