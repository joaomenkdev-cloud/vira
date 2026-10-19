import { OAUTH_PROVIDERS, type OAuthProviderName } from "@vira/shared";

/**
 * The social logins the sign-in page offers. The API turns a provider on only when its
 * credentials are set and answers 404 otherwise, so the web is told which ones exist:
 * `VIRA_OAUTH_PROVIDERS=google,github`. Read on every request (the pages are dynamic);
 * unknown names are ignored, and nothing set means no social login buttons.
 */
export function enabledOAuthProviders(
  env: Readonly<Record<string, string | undefined>>,
): readonly OAuthProviderName[] {
  const requested = new Set(
    (env["VIRA_OAUTH_PROVIDERS"] ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name !== ""),
  );
  return OAUTH_PROVIDERS.filter((provider) => requested.has(provider));
}
