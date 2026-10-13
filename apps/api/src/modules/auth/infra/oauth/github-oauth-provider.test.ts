import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { OAuthProviderError } from "../../application/ports/oauth-provider.js";
import { GitHubOAuthProvider } from "./github-oauth-provider.js";
import { type CannedResponse, FakeProviderServer } from "./provider-server.fakes.js";

const CLIENT = { clientId: "Iv1.vira-test", clientSecret: "github-secret" };
const EXCHANGE = {
  code: "github-code",
  codeVerifier: "v".repeat(43),
  nonce: "n".repeat(43),
  redirectUri: "http://localhost:3001/api/v1/auth/oauth/github/callback",
};
const ACCESS_TOKEN = "gho_secret";

describe("GitHubOAuthProvider (against a local fake of GitHub)", () => {
  const server = new FakeProviderServer();
  let github: GitHubOAuthProvider;
  let token: CannedResponse;
  let user: CannedResponse;
  let emails: CannedResponse;

  beforeAll(async () => {
    await server.start();
    server.on("POST", "/login/oauth/access_token", () => token);
    server.on("GET", "/user", () => user);
    server.on("GET", "/user/emails", () => emails);
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.received.length = 0;
    github = new GitHubOAuthProvider(CLIENT, {
      authorization: "https://github.com/login/oauth/authorize",
      token: server.url("/login/oauth/access_token"),
      api: server.url(""),
    });
    token = { body: { access_token: ACCESS_TOKEN, token_type: "bearer", scope: "read:user" } };
    user = { body: { id: 583231, login: "anasouza", name: "Ana Souza" } };
    emails = {
      body: [
        { email: "ana@users.noreply.github.com", primary: false, verified: true },
        { email: "ana@exemplo.com", primary: true, verified: true },
      ],
    };
  });

  it("asks for the code with PKCE S256 and state, and only the scopes it needs", () => {
    const url = github.authorizationUrl({
      state: "s".repeat(43),
      codeChallenge: "c".repeat(43),
      nonce: EXCHANGE.nonce,
      redirectUri: EXCHANGE.redirectUri,
    });

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.clientId,
      redirect_uri: EXCHANGE.redirectUri,
      scope: "read:user user:email",
      state: "s".repeat(43),
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
      allow_signup: "true",
    });
  });

  it("trades the code with the verifier, then reads the profile with the token", async () => {
    const profile = await github.profile(EXCHANGE);

    expect(profile).toEqual({
      accountId: "583231",
      email: "ana@exemplo.com",
      emailVerified: true,
      name: "Ana Souza",
    });
    const [exchange] = server.requestsTo("/login/oauth/access_token");
    expect(exchange?.form).toEqual({
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
      code: EXCHANGE.code,
      code_verifier: EXCHANGE.codeVerifier,
      redirect_uri: EXCHANGE.redirectUri,
    });
    expect(exchange?.headers.accept).toBe("application/json");
    for (const path of ["/user", "/user/emails"]) {
      expect(server.requestsTo(path)[0]?.headers.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    }
    expect(JSON.stringify(profile)).not.toContain(ACCESS_TOKEN);
  });

  it("uses the login when the account has no display name", async () => {
    user = { body: { id: 583231, login: "anasouza", name: null } };
    expect((await github.profile(EXCHANGE)).name).toBe("anasouza");
  });

  it("only vouches for the primary address, and only if GitHub verified it", async () => {
    emails = {
      body: [
        { email: "ana@exemplo.com", primary: true, verified: false },
        { email: "ana@outro.com", primary: false, verified: true },
      ],
    };
    expect(await github.profile(EXCHANGE)).toMatchObject({
      email: "ana@exemplo.com",
      emailVerified: false,
    });

    emails = { body: [] };
    expect(await github.profile(EXCHANGE)).toMatchObject({ email: null, emailVerified: false });
  });

  it("fails when GitHub refuses the code (it says so with a 200)", async () => {
    token = { body: { error: "bad_verification_code", error_description: "expired" } };
    await expect(github.profile(EXCHANGE)).rejects.toThrow(
      new OAuthProviderError("GitHub refused the code: bad_verification_code"),
    );
    expect(server.requestsTo("/user")).toHaveLength(0);
  });

  it("fails when the e-mails cannot be read", async () => {
    emails = { status: 403, body: { message: "Resource not accessible by integration" } };
    await expect(github.profile(EXCHANGE)).rejects.toThrow(OAuthProviderError);
  });

  it("fails on an answer it does not understand", async () => {
    user = { body: { id: "not-a-number", login: "anasouza" } };
    await expect(github.profile(EXCHANGE)).rejects.toThrow(/unexpected response/);

    user = { body: "<html>rate limited</html>" };
    await expect(github.profile(EXCHANGE)).rejects.toThrow(/not JSON/);
  });

  it("fails when GitHub cannot be reached", async () => {
    const offline = new GitHubOAuthProvider(CLIENT, {
      authorization: "https://github.com/login/oauth/authorize",
      token: "http://127.0.0.1:1/login/oauth/access_token",
      api: "http://127.0.0.1:1",
    });
    await expect(offline.profile(EXCHANGE)).rejects.toThrow(/did not answer/);
  });
});
