import { Inject, Injectable } from "@nestjs/common";
import type { OAuthProviderName } from "@vira/shared";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import {
  isSafeReturnPath,
  type OAuthAttempt,
  pkceChallenge,
  startLoginAttempt,
} from "../domain/oauth.js";
import { OAuthProviderUnavailableError } from "./errors.js";
import { OAUTH_PROVIDERS, type OAuthProviders } from "./ports/oauth-provider.js";

/**
 * First half of a social login: the provider URL to send the browser to, and the
 * attempt's secrets, which the HTTP layer keeps in the browser until it comes back.
 */
@Injectable()
export class BeginOAuthLogin {
  constructor(
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProviders,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * @param returnTo page of the web app to land on afterwards; ignored unless it is a
   *   plain path on the web's own origin.
   * @throws OAuthProviderUnavailableError for a provider that is off.
   */
  execute(input: {
    readonly provider: OAuthProviderName;
    readonly redirectUri: string;
    readonly returnTo?: string | undefined;
  }): { readonly authorizationUrl: URL; readonly attempt: OAuthAttempt } {
    const provider = this.providers.get(input.provider);
    if (!provider) throw new OAuthProviderUnavailableError();

    const attempt = startLoginAttempt({
      provider: input.provider,
      returnTo:
        input.returnTo !== undefined && isSafeReturnPath(input.returnTo) ? input.returnTo : null,
      now: this.clock.now(),
    });
    const authorizationUrl = provider.authorizationUrl({
      state: attempt.state,
      codeChallenge: pkceChallenge(attempt.codeVerifier),
      nonce: attempt.nonce,
      redirectUri: input.redirectUri,
    });
    return { authorizationUrl, attempt };
  }
}
