import type { OAuthProviderName } from "@vira/shared";

import type { AppConfig } from "../../../../platform/config/config.schema.js";
import type { Clock } from "../../../../platform/runtime/runtime.js";
import type { OAuthProvider, OAuthProviders } from "../../application/ports/oauth-provider.js";
import { GitHubOAuthProvider } from "./github-oauth-provider.js";
import { GoogleOAuthProvider } from "./google-oauth-provider.js";

/** One adapter per provider that has credentials; the others stay off (their routes `404`). */
export function configuredOAuthProviders(config: AppConfig, clock: Clock): OAuthProviders {
  const { google, github } = config.auth.oauth;
  const providers = new Map<OAuthProviderName, OAuthProvider>();
  if (google) providers.set("google", new GoogleOAuthProvider(google, clock));
  if (github) providers.set("github", new GitHubOAuthProvider(github));
  return providers;
}
