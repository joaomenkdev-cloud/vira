import { createHash, randomBytes } from "node:crypto";

import { NAME_MAX_LENGTH, type OAuthProviderName } from "@vira/shared";

/**
 * Social login (ADR-0005, docs/SECURITY_MODEL.md, ASVS V10): Authorization Code with
 * PKCE, a `state` bound to the browser and, for OpenID Connect, a `nonce` bound to the
 * ID token. Nothing the provider hands over (codes, tokens) is ever stored.
 */

/** How long someone has to come back from the provider's consent screen. */
export const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000;

/** 256 bits from the CSPRNG, base64url (43 characters). */
const SECRET_BYTES = 32;

/** Longest path after login the API redirects to (`?next=` on the start route). */
const RETURN_PATH_MAX_LENGTH = 512;

/** One login attempt, from the redirect to the provider until it comes back. */
export interface OAuthAttempt {
  readonly provider: OAuthProviderName;
  /** Ties the provider's callback to the browser that started (login CSRF). */
  readonly state: string;
  /** PKCE secret (RFC 7636); the provider only ever sees its SHA-256. */
  readonly codeVerifier: string;
  /** Echoed inside Google's ID token, so a token minted for another login is refused. */
  readonly nonce: string;
  /** Where on the web to land after logging in; `/` when absent. */
  readonly returnTo: string | null;
  readonly expiresAt: Date;
}

/** What a provider tells us about the person, once it has checked the code. */
export interface OAuthProfile {
  /** Stable id of the account at the provider (Google `sub`, GitHub user id). */
  readonly accountId: string;
  /** As the provider sent it; normalized by the use case. */
  readonly email: string | null;
  /** Whether the provider vouches that the person owns `email`. */
  readonly emailVerified: boolean;
  /** Display name, possibly empty. */
  readonly name: string;
}

/** A provider account linked to a Vira account (docs/DATA_MODEL.md#oauth_accounts). */
export interface OAuthAccount {
  readonly id: string;
  readonly userId: string;
  readonly provider: OAuthProviderName;
  readonly providerAccountId: string;
  readonly createdAt: Date;
}

function randomSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

/** RFC 7636, section 4.2: `BASE64URL(SHA256(code_verifier))`, method `S256`. */
export function pkceChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

export function startOAuthAttempt(input: {
  readonly provider: OAuthProviderName;
  readonly returnTo: string | null;
  readonly now: Date;
}): OAuthAttempt {
  return Object.freeze({
    provider: input.provider,
    state: randomSecret(),
    codeVerifier: randomSecret(),
    nonce: randomSecret(),
    returnTo: input.returnTo,
    expiresAt: new Date(input.now.getTime() + OAUTH_ATTEMPT_TTL_MS),
  });
}

/**
 * Whether `path` is a page of the web app and nothing else: it starts with a single `/`
 * (`//evil.com` and `/\evil.com` are other hosts to a browser), has no scheme, no
 * control characters and no backslashes. Anything else would be an open redirect.
 */
export function isSafeReturnPath(path: string): boolean {
  return (
    path.length <= RETURN_PATH_MAX_LENGTH &&
    /^\/(?![/\\])[\x21-\x7e]*$/.test(path) &&
    !path.includes("\\")
  );
}

/**
 * The name a new account gets: the provider's display name, trimmed and cut to the
 * column's limit, or the e-mail's local part when the provider has none.
 */
export function accountNameFrom(profileName: string, email: string): string {
  const name = firstCodePoints(profileName.trim(), NAME_MAX_LENGTH).trim();
  if (name.length > 0) return name;
  return firstCodePoints(email.slice(0, email.indexOf("@")), NAME_MAX_LENGTH) || "Pessoa";
}

/** Cut by code points, as Postgres' `char_length` counts them (never halving a surrogate pair). */
function firstCodePoints(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}
