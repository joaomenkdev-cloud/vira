import { randomBytes } from "node:crypto";

import type { OAuthProviderName } from "@vira/shared";

import {
  type AuthorizationRequest,
  type CodeExchange,
  type OAuthProvider,
  OAuthProviderError,
} from "../../src/modules/auth/application/ports/oauth-provider.js";
import { type OAuthProfile, pkceChallenge } from "../../src/modules/auth/domain/oauth.js";

interface Grant {
  readonly profile: OAuthProfile;
  readonly codeChallenge: string;
  readonly nonce: string;
  readonly redirectUri: string;
}

/**
 * A provider that behaves like a real one where it matters: codes work once, only with
 * the PKCE verifier whose challenge was on the authorization request, and only for the
 * same redirect URI and nonce. `consent` plays the person approving on the provider's
 * screen and answers the code the provider would put on the callback.
 */
export class FakeOAuthProvider implements OAuthProvider {
  readonly exchanges: CodeExchange[] = [];
  private readonly grants = new Map<string, Grant>();

  constructor(readonly name: OAuthProviderName) {}

  authorizationUrl(request: AuthorizationRequest): URL {
    const url = new URL(`https://${this.name}.provider.test/authorize`);
    url.search = new URLSearchParams({
      redirect_uri: request.redirectUri,
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url;
  }

  /** The person approves on the provider: a code for the authorization request at `url`. */
  consent(url: URL | string, profile: OAuthProfile): string {
    const params = new URL(url).searchParams;
    const code = randomBytes(16).toString("hex");
    this.grants.set(code, {
      profile,
      codeChallenge: params.get("code_challenge") ?? "",
      nonce: params.get("nonce") ?? "",
      redirectUri: params.get("redirect_uri") ?? "",
    });
    return code;
  }

  profile(exchange: CodeExchange): Promise<OAuthProfile> {
    this.exchanges.push(exchange);
    const grant = this.grants.get(exchange.code);
    this.grants.delete(exchange.code);
    if (
      grant?.codeChallenge !== pkceChallenge(exchange.codeVerifier) ||
      grant.nonce !== exchange.nonce ||
      grant.redirectUri !== exchange.redirectUri
    ) {
      return Promise.reject(new OAuthProviderError("invalid_grant"));
    }
    return Promise.resolve(grant.profile);
  }
}
