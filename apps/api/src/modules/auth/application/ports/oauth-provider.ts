import type { OAuthProviderName } from "@vira/shared";

import type { OAuthProfile } from "../../domain/oauth.js";

/** Where to send the browser to log in at the provider. */
export interface AuthorizationRequest {
  readonly state: string;
  /** PKCE `code_challenge` (S256). */
  readonly codeChallenge: string;
  readonly nonce: string;
  /** Must be registered with the provider; sent again with the code. */
  readonly redirectUri: string;
}

/** What comes back from the provider, plus the secrets kept since the redirect. */
export interface CodeExchange {
  readonly code: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly redirectUri: string;
}

/** The provider refused the code or answered something we cannot trust or read. */
export class OAuthProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OAuthProviderError";
  }
}

/** One social login provider (Google, GitHub). */
export interface OAuthProvider {
  readonly name: OAuthProviderName;
  authorizationUrl(request: AuthorizationRequest): URL;
  /**
   * Trades the code for the person's profile. The provider's tokens live only inside
   * this call: they are never returned, logged or stored.
   * @throws OAuthProviderError when the exchange fails or the answer does not check out.
   */
  profile(exchange: CodeExchange): Promise<OAuthProfile>;
}

/** The providers that have credentials configured; the others are off. */
export type OAuthProviders = ReadonlyMap<OAuthProviderName, OAuthProvider>;

export const OAUTH_PROVIDERS = Symbol("OAUTH_PROVIDERS");
