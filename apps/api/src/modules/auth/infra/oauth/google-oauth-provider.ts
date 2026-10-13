import { createPublicKey, type KeyObject, timingSafeEqual, verify } from "node:crypto";

import { z } from "zod";

import type { Clock } from "../../../../platform/runtime/runtime.js";
import {
  type AuthorizationRequest,
  type CodeExchange,
  type OAuthProvider,
  OAuthProviderError,
} from "../../application/ports/oauth-provider.js";
import type { OAuthProfile } from "../../domain/oauth.js";
import { formBody, requestJson } from "./provider-http.js";

export interface GoogleEndpoints {
  readonly authorization: string;
  readonly token: string;
  readonly keys: string;
}

/** Google's OpenID Connect endpoints (https://accounts.google.com/.well-known/openid-configuration). */
export const GOOGLE_ENDPOINTS: GoogleEndpoints = {
  authorization: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  keys: "https://www.googleapis.com/oauth2/v3/certs",
};

/** Both spellings Google uses for `iss` (OpenID Connect, "Validating an ID token"). */
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/** Tolerated clock difference with Google, in seconds. */
const CLOCK_SKEW_SECONDS = 60;
/** Google rotates its keys every few days and announces them well before use. */
const KEYS_TTL_MS = 60 * 60 * 1000;
/** An unknown `kid` refetches the key set at most this often, so it cannot be used to flood Google. */
const KEYS_REFETCH_MIN_MS = 60 * 1000;

const tokenResponseSchema = z.object({
  id_token: z
    .string()
    .min(1)
    .max(8 * 1024),
});

const keySetSchema = z.object({
  keys: z.array(
    z.looseObject({
      kid: z.string().min(1),
      kty: z.literal("RSA"),
      n: z.string().min(1),
      e: z.string().min(1),
      alg: z.string().optional(),
      use: z.string().optional(),
    }),
  ),
});

/** Exactly one algorithm is accepted; `none`, HS256 and friends never reach the verifier. */
const headerSchema = z.object({ alg: z.literal("RS256"), kid: z.string().min(1) });

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  azp: z.string().optional(),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

function decodeJson(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Google login through OpenID Connect (Authorization Code + PKCE). The profile comes from
 * the ID token, which is checked the way OpenID Connect Core 3.1.3.7 asks: RS256
 * signature with one of Google's published keys, issuer, audience (our client id),
 * expiry, issue time and the nonce of this login attempt.
 */
export class GoogleOAuthProvider implements OAuthProvider {
  readonly name = "google";

  private keys = new Map<string, KeyObject>();
  private keysFetchedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly client: { readonly clientId: string; readonly clientSecret: string },
    private readonly clock: Clock,
    private readonly endpoints: GoogleEndpoints = GOOGLE_ENDPOINTS,
  ) {}

  authorizationUrl(request: AuthorizationRequest): URL {
    const url = new URL(this.endpoints.authorization);
    url.search = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: request.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url;
  }

  async profile(exchange: CodeExchange): Promise<OAuthProfile> {
    const { id_token: idToken } = await requestJson(
      this.endpoints.token,
      {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formBody({
          grant_type: "authorization_code",
          code: exchange.code,
          code_verifier: exchange.codeVerifier,
          redirect_uri: exchange.redirectUri,
          client_id: this.client.clientId,
          client_secret: this.client.clientSecret,
        }),
      },
      tokenResponseSchema,
    );
    const claims = await this.verifyIdToken(idToken, exchange.nonce);
    return {
      accountId: claims.sub,
      email: claims.email ?? null,
      emailVerified: claims.email_verified === true,
      name: claims.name ?? "",
    };
  }

  private async verifyIdToken(token: string, nonce: string): Promise<z.infer<typeof claimsSchema>> {
    const parts = token.split(".");
    if (parts.length !== 3) throw new OAuthProviderError("ID token is not a JWS");
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

    const header = headerSchema.safeParse(decodeJson(headerPart));
    if (!header.success) throw new OAuthProviderError("ID token header refused");

    const key = await this.keyFor(header.data.kid);
    const signed = verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`, "ascii"),
      key,
      Buffer.from(signaturePart, "base64url"),
    );
    if (!signed) throw new OAuthProviderError("ID token signature invalid");

    const parsed = claimsSchema.safeParse(decodeJson(payloadPart));
    if (!parsed.success) throw new OAuthProviderError("ID token claims unreadable");
    const claims = parsed.data;

    const now = this.clock.now().getTime() / 1000;
    const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
    const problems = [
      !ISSUERS.has(claims.iss) && "issuer",
      !audiences.includes(this.client.clientId) && "audience",
      audiences.length > 1 && claims.azp !== this.client.clientId && "authorized party",
      claims.exp + CLOCK_SKEW_SECONDS <= now && "expired",
      claims.iat - CLOCK_SKEW_SECONDS > now && "issued in the future",
      (claims.nonce === undefined || !sameString(claims.nonce, nonce)) && "nonce",
    ].filter(Boolean);
    if (problems.length > 0) {
      throw new OAuthProviderError(`ID token refused: ${problems.join(", ")}`);
    }
    return claims;
  }

  /** The key Google signed with; the set is cached and refetched when it rotates. */
  private async keyFor(kid: string): Promise<KeyObject> {
    const now = this.clock.now().getTime();
    const stale = now - this.keysFetchedAt > KEYS_TTL_MS;
    const unknown = !this.keys.has(kid) && now - this.keysFetchedAt > KEYS_REFETCH_MIN_MS;
    if (stale || unknown) {
      const { keys } = await requestJson(this.endpoints.keys, { method: "GET" }, keySetSchema);
      const fresh = new Map<string, KeyObject>();
      for (const jwk of keys) {
        try {
          fresh.set(
            jwk.kid,
            createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: "jwk" }),
          );
        } catch {
          // A key we cannot read cannot have signed anything we accept.
        }
      }
      this.keys = fresh;
      this.keysFetchedAt = now;
    }
    const key = this.keys.get(kid);
    if (!key) throw new OAuthProviderError("ID token signed with an unknown key");
    return key;
  }
}
