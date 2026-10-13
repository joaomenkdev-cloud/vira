import { problemDetailsSchema } from "@vira/shared";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { OAUTH_PROVIDERS } from "../src/modules/auth/application/ports/oauth-provider.js";
import { OAuthAttemptCookie } from "../src/modules/auth/http/oauth-attempt-cookie.js";
import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { RATE_LIMITER } from "../src/platform/rate-limit/rate-limiter.js";
import { CLOCK } from "../src/platform/runtime/runtime.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "./support/create-test-app.js";
import { FakeOAuthProvider } from "./support/fake-oauth-provider.js";
import { InMemoryRateLimiter } from "./support/in-memory-rate-limiter.js";

const ATTEMPT_COOKIE = "__Secure-vira_oauth";
const SESSION_COOKIES = ["__Host-vira_at", "__Secure-vira_rt"];
const LOGIN_PAGE = `${TEST_WEB_ORIGIN}/entrar`;

function setCookies(response: Response): string[] {
  return (response.headers["set-cookie"] ?? []) as unknown as string[];
}

function locationOf(response: Response): string {
  const location: unknown = response.headers["location"];
  if (typeof location !== "string") throw new Error("no Location header");
  return location;
}

function cookieValue(response: Response, name: string): string | undefined {
  const header = setCookies(response).find((c) => c.startsWith(`${name}=`));
  return header?.slice(name.length + 1, header.indexOf(";"));
}

// No database here: every refusal below happens before an account is looked up.
describe("social login: redirects and refusals (no infrastructure)", () => {
  describe("with no provider configured", () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    it.each([
      "/api/v1/auth/oauth/google",
      "/api/v1/auth/oauth/github/callback?code=x&state=y",
      "/api/v1/auth/oauth/facebook",
    ])("answers 404 to %s", async (path) => {
      const response = await request(testApp.app.getHttpServer()).get(path).expect(404);
      expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri("not-found"));
    });
  });

  describe("with Google's real adapter configured", () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp({
        env: { GOOGLE_CLIENT_ID: "vira.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "s" },
      });
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    it("sends the browser to Google with state, PKCE and the callback on the web origin", async () => {
      const response = await request(testApp.app.getHttpServer())
        .get("/api/v1/auth/oauth/google")
        .expect(302);

      const location = new URL(locationOf(response));
      expect(location.origin).toBe("https://accounts.google.com");
      expect(location.searchParams.get("client_id")).toBe("vira.apps.googleusercontent.com");
      expect(location.searchParams.get("redirect_uri")).toBe(
        `${TEST_WEB_ORIGIN}/api/v1/auth/oauth/google/callback`,
      );
      expect(location.searchParams.get("code_challenge_method")).toBe("S256");
      expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(response.headers["cache-control"]).toBe("no-store");

      const attempt = setCookies(response).find((c) => c.startsWith(`${ATTEMPT_COOKIE}=`));
      expect(attempt).toMatch(/; Max-Age=600;/);
      expect(attempt).toMatch(/; Path=\/api\/v1\/auth\/oauth;/);
      expect(attempt).toMatch(/; HttpOnly; Secure; SameSite=Lax$/);
    });

    it("keeps GitHub off", async () => {
      await request(testApp.app.getHttpServer()).get("/api/v1/auth/oauth/github").expect(404);
    });
  });

  describe("with fake providers", () => {
    let testApp: TestApp;
    const google = new FakeOAuthProvider("google");
    const github = new FakeOAuthProvider("github");
    const limiter = new InMemoryRateLimiter();
    const clock = { current: new Date(), now: () => clock.current };
    let ipCounter = 0;
    let ip = "";

    const get = (path: string, cookie?: string) => {
      const call = request(testApp.app.getHttpServer())
        .get(`/api/v1/auth/oauth/${path}`)
        .set("X-Forwarded-For", ip);
      return cookie ? call.set("Cookie", cookie) : call;
    };

    /** Starts a login: the provider URL and the attempt cookie the browser got. */
    async function start(provider: "google" | "github", next?: string) {
      const response = await get(
        next === undefined ? provider : `${provider}?next=${encodeURIComponent(next)}`,
      ).expect(302);
      const url = new URL(locationOf(response));
      const cookie = `${ATTEMPT_COOKIE}=${cookieValue(response, ATTEMPT_COOKIE)}`;
      return { url, cookie, state: url.searchParams.get("state") ?? "" };
    }

    function expectRefused(response: Response, code: string): void {
      expect(response.status).toBe(302);
      expect(response.headers["location"]).toBe(`${LOGIN_PAGE}?erro=${code}`);
      const names = setCookies(response).map((c) => c.slice(0, c.indexOf("=")));
      for (const name of SESSION_COOKIES) expect(names).not.toContain(name);
      // The attempt is spent either way.
      expect(setCookies(response).find((c) => c.startsWith(`${ATTEMPT_COOKIE}=;`))).toBeDefined();
    }

    beforeAll(async () => {
      testApp = await createTestApp({
        env: { TRUST_PROXY_HOPS: "1" },
        override: (builder) =>
          builder
            .overrideProvider(OAUTH_PROVIDERS)
            .useValue(
              new Map([
                ["google", google],
                ["github", github],
              ]),
            )
            .overrideProvider(RATE_LIMITER)
            .useValue(limiter)
            .overrideProvider(CLOCK)
            .useValue(clock),
      });
    });

    afterAll(async () => {
      await testApp.app.close();
    });

    beforeEach(() => {
      ipCounter++;
      ip = `198.51.100.${ipCounter}`;
      clock.current = new Date();
      google.exchanges.length = 0;
    });

    it("refuses a callback without the browser's attempt (login CSRF) and never trades the code", async () => {
      const { state } = await start("google");
      expectRefused(await get(`google/callback?code=abc&state=${state}`), "oauth-failed");
      expect(google.exchanges).toEqual([]);
    });

    it("refuses a state that is not the browser's", async () => {
      const { cookie } = await start("google");
      const other = await start("google");
      const response = await get(`google/callback?code=abc&state=${other.state}`, cookie);
      expectRefused(response, "oauth-failed");
      expect(google.exchanges).toEqual([]);
    });

    it("refuses another provider's attempt", async () => {
      const { cookie, state } = await start("github");
      expectRefused(await get(`google/callback?code=abc&state=${state}`, cookie), "oauth-failed");
    });

    it("refuses an altered attempt cookie", async () => {
      const { cookie, state } = await start("google");
      const altered = `${cookie.slice(0, -4)}AAAA`;
      expectRefused(await get(`google/callback?code=abc&state=${state}`, altered), "oauth-failed");
    });

    it("refuses an attempt older than ten minutes", async () => {
      const { cookie, state } = await start("google");
      clock.current = new Date(clock.current.getTime() + 10 * 60 * 1000);
      expectRefused(await get(`google/callback?code=abc&state=${state}`, cookie), "oauth-failed");
    });

    it("tells the person they said no at the provider", async () => {
      const { cookie, state } = await start("google");
      expectRefused(
        await get(`google/callback?error=access_denied&state=${state}`, cookie),
        "oauth-denied",
      );
    });

    it("fails when the provider does not accept the code", async () => {
      const { cookie, state } = await start("google");
      expectRefused(
        await get(`google/callback?code=forged&state=${state}`, cookie),
        "oauth-failed",
      );
      expect(google.exchanges).toHaveLength(1);
    });

    it("refuses a callback without a code", async () => {
      const { cookie, state } = await start("google");
      expectRefused(await get(`google/callback?state=${state}`, cookie), "oauth-failed");
    });

    it("only remembers a return path on the web's own origin", async () => {
      const attempts = testApp.app.get(OAuthAttemptCookie);
      const returnTo = async (next: string) =>
        attempts.read((await start("google", next)).cookie.slice(ATTEMPT_COOKIE.length + 1))
          ?.returnTo;

      expect(await returnTo("/eventos/show")).toBe("/eventos/show");
      expect(await returnTo("//evil.example")).toBeNull();
      expect(await returnTo("https://evil.example")).toBeNull();
    });

    it("limits each route to 20 requests a minute per IP", async () => {
      for (let i = 0; i < 20; i++) await get("google").expect(302);
      const limited = await get("google").expect(429);
      expect(limited.headers["retry-after"]).toBeDefined();

      for (let i = 0; i < 20; i++) await get("google/callback?error=access_denied").expect(302);
      await get("google/callback?error=access_denied").expect(429);
    });
  });
});
