import { createHmac, generateKeyPairSync, type KeyObject, sign } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { OAuthProviderError } from "../../application/ports/oauth-provider.js";
import { FakeClock } from "../../application/in-memory.fakes.js";
import { GoogleOAuthProvider } from "./google-oauth-provider.js";
import { FakeProviderServer } from "./provider-server.fakes.js";

const CLIENT = { clientId: "vira-test.apps.googleusercontent.com", clientSecret: "google-secret" };
const EXCHANGE = {
  code: "4/0Ab-code",
  codeVerifier: "v".repeat(43),
  nonce: "n".repeat(43),
  redirectUri: "http://localhost:3001/api/v1/auth/oauth/google/callback",
};

const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const strangerKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

function jwt(
  claims: Record<string, unknown>,
  options: { header?: Record<string, unknown>; key?: KeyObject } = {},
): string {
  const header = options.header ?? { alg: "RS256", kid: "key-1", typ: "JWT" };
  const input = `${b64(header)}.${b64(claims)}`;
  const signature = sign("RSA-SHA256", Buffer.from(input), options.key ?? signingKey.privateKey);
  return `${input}.${signature.toString("base64url")}`;
}

describe("GoogleOAuthProvider (against a local fake of Google)", () => {
  const server = new FakeProviderServer();
  let clock: FakeClock;
  let google: GoogleOAuthProvider;
  let idToken: string;

  const nowSeconds = () => Math.floor(clock.now().getTime() / 1000);
  const claims = (overrides: Record<string, unknown> = {}) => ({
    iss: "https://accounts.google.com",
    aud: CLIENT.clientId,
    azp: CLIENT.clientId,
    sub: "110169484474386276334",
    email: "ana@gmail.com",
    email_verified: true,
    name: "Ana Souza",
    nonce: EXCHANGE.nonce,
    iat: nowSeconds(),
    exp: nowSeconds() + 3600,
    ...overrides,
  });

  beforeAll(async () => {
    await server.start();
    server.on("POST", "/token", () => ({
      body: { access_token: "ya29.secret", id_token: idToken, token_type: "Bearer" },
    }));
    server.on("GET", "/certs", () => ({
      body: {
        keys: [{ ...signingKey.publicKey.export({ format: "jwk" }), kid: "key-1", alg: "RS256" }],
      },
    }));
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.received.length = 0;
    clock = new FakeClock(new Date("2026-10-14T12:00:00Z"));
    google = new GoogleOAuthProvider(CLIENT, clock, {
      authorization: "https://accounts.google.com/o/oauth2/v2/auth",
      token: server.url("/token"),
      keys: server.url("/certs"),
    });
    idToken = jwt(claims());
  });

  it("asks for the code with PKCE S256, state and nonce", () => {
    const url = google.authorizationUrl({
      state: "s".repeat(43),
      codeChallenge: "c".repeat(43),
      nonce: EXCHANGE.nonce,
      redirectUri: EXCHANGE.redirectUri,
    });

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: CLIENT.clientId,
      redirect_uri: EXCHANGE.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: "s".repeat(43),
      nonce: EXCHANGE.nonce,
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
      prompt: "select_account",
    });
  });

  it("trades the code with the verifier and reads the profile from a valid ID token", async () => {
    const profile = await google.profile(EXCHANGE);

    expect(profile).toEqual({
      accountId: "110169484474386276334",
      email: "ana@gmail.com",
      emailVerified: true,
      name: "Ana Souza",
    });
    expect(server.requestsTo("/token")[0]?.form).toEqual({
      grant_type: "authorization_code",
      code: EXCHANGE.code,
      code_verifier: EXCHANGE.codeVerifier,
      redirect_uri: EXCHANGE.redirectUri,
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
    });
    expect(JSON.stringify(profile)).not.toContain("ya29");
  });

  it("reports an e-mail Google has not verified as such", async () => {
    idToken = jwt(claims({ email_verified: false }));
    expect((await google.profile(EXCHANGE)).emailVerified).toBe(false);
  });

  it("caches Google's keys between logins", async () => {
    await google.profile(EXCHANGE);
    await google.profile(EXCHANGE);
    expect(server.requestsTo("/certs")).toHaveLength(1);
  });

  describe("refuses an ID token", () => {
    const refused = async (token: string, reason: RegExp) => {
      idToken = token;
      await expect(google.profile(EXCHANGE)).rejects.toThrow(reason);
    };

    it("with alg none", async () => {
      const unsigned = `${b64({ alg: "none", kid: "key-1" })}.${b64(claims())}.`;
      await refused(unsigned, /header refused/);
    });

    it("signed with HS256 using the public key as the secret", async () => {
      const header = b64({ alg: "HS256", kid: "key-1" });
      const payload = b64(claims());
      const publicPem = signingKey.publicKey.export({ format: "pem", type: "spki" });
      const mac = createHmac("sha256", publicPem).update(`${header}.${payload}`).digest();
      await refused(`${header}.${payload}.${mac.toString("base64url")}`, /header refused/);
    });

    it("signed by someone else's key under Google's key id", async () => {
      await refused(jwt(claims(), { key: strangerKey.privateKey }), /signature invalid/);
    });

    it("whose claims were changed after signing", async () => {
      const [header, , signature] = jwt(claims()).split(".");
      await refused(`${header}.${b64(claims({ sub: "someone-else" }))}.${signature}`, /signature/);
    });

    it("with a key id Google does not publish", async () => {
      await refused(jwt(claims(), { header: { alg: "RS256", kid: "key-9" } }), /unknown key/);
    });

    it.each([
      ["from another issuer", { iss: "https://evil.example" }, /issuer/],
      ["for another client", { aud: "other.apps.googleusercontent.com" }, /audience/],
      [
        "for several clients without us as the authorized party",
        { aud: [CLIENT.clientId, "other"], azp: "other" },
        /authorized party/,
      ],
      ["for another login attempt", { nonce: "x".repeat(43) }, /nonce/],
      ["without a nonce", { nonce: undefined }, /nonce/],
    ])("%s", async (_, overrides, reason) => {
      await refused(jwt(claims(overrides)), reason);
    });

    it("that expired, or that was issued in the future", async () => {
      await refused(jwt(claims({ exp: nowSeconds() - 61 })), /expired/);
      await refused(jwt(claims({ iat: nowSeconds() + 3600 })), /future/);
    });
  });

  it("fails cleanly when Google refuses the code", async () => {
    server.on("POST", "/token", () => ({ status: 400, body: { error: "invalid_grant" } }));
    try {
      const failure = await google.profile(EXCHANGE).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(OAuthProviderError);
      expect((failure as Error).message).toBe("POST /token answered 400");
    } finally {
      server.on("POST", "/token", () => ({ body: { id_token: idToken } }));
    }
  });

  it("refuses an oversized answer", async () => {
    server.on("POST", "/token", () => ({ body: { id_token: "x".repeat(70_000) } }));
    try {
      await expect(google.profile(EXCHANGE)).rejects.toThrow(/too large/);
    } finally {
      server.on("POST", "/token", () => ({ body: { id_token: idToken } }));
    }
  });
});
