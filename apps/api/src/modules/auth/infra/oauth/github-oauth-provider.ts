import { z } from "zod";

import {
  type AuthorizationRequest,
  type CodeExchange,
  type OAuthProvider,
  OAuthProviderError,
} from "../../application/ports/oauth-provider.js";
import type { OAuthProfile } from "../../domain/oauth.js";
import { formBody, requestJson } from "./provider-http.js";

export interface GitHubEndpoints {
  readonly authorization: string;
  readonly token: string;
  /** REST API root (`/user`, `/user/emails`). */
  readonly api: string;
}

export const GITHUB_ENDPOINTS: GitHubEndpoints = {
  authorization: "https://github.com/login/oauth/authorize",
  token: "https://github.com/login/oauth/access_token",
  api: "https://api.github.com",
};

/** GitHub answers token errors with `200` and an `error` field. */
const tokenResponseSchema = z.union([
  z.object({ access_token: z.string().min(1).max(1024), token_type: z.string() }),
  z.object({ error: z.string() }),
]);

const userSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1).max(100),
  name: z.string().nullable().optional(),
});

const emailsSchema = z
  .array(z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }))
  .max(100);

/**
 * GitHub login (OAuth App, Authorization Code + PKCE). GitHub has no ID token, so the
 * profile comes from the REST API with the access token, which is dropped right after.
 * Only the **primary** address counts, and only if GitHub verified it: a secondary
 * address is easy to add and says less about who owns the account.
 */
export class GitHubOAuthProvider implements OAuthProvider {
  readonly name = "github";

  constructor(
    private readonly client: { readonly clientId: string; readonly clientSecret: string },
    private readonly endpoints: GitHubEndpoints = GITHUB_ENDPOINTS,
  ) {}

  authorizationUrl(request: AuthorizationRequest): URL {
    const url = new URL(this.endpoints.authorization);
    url.search = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: request.redirectUri,
      scope: "read:user user:email",
      state: request.state,
      code_challenge: request.codeChallenge,
      code_challenge_method: "S256",
      allow_signup: "true",
    }).toString();
    return url;
  }

  async profile(exchange: CodeExchange): Promise<OAuthProfile> {
    const token = await requestJson(
      this.endpoints.token,
      {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formBody({
          client_id: this.client.clientId,
          client_secret: this.client.clientSecret,
          code: exchange.code,
          code_verifier: exchange.codeVerifier,
          redirect_uri: exchange.redirectUri,
        }),
      },
      tokenResponseSchema,
    );
    if ("error" in token) throw new OAuthProviderError(`GitHub refused the code: ${token.error}`);
    if (token.token_type.toLowerCase() !== "bearer") {
      throw new OAuthProviderError("GitHub sent an unexpected token type");
    }

    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "User-Agent": "vira-api",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const [user, emails] = await Promise.all([
      requestJson(`${this.endpoints.api}/user`, { method: "GET", headers }, userSchema),
      requestJson(`${this.endpoints.api}/user/emails`, { method: "GET", headers }, emailsSchema),
    ]);

    const primary = emails.find((entry) => entry.primary);
    return {
      accountId: String(user.id),
      email: primary?.email ?? null,
      emailVerified: primary?.verified ?? false,
      name: user.name?.trim() ? user.name.trim() : user.login,
    };
  }
}
