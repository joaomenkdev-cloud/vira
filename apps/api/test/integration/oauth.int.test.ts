import { problemDetailsSchema, type SessionListResponse } from "@vira/shared";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { OAUTH_PROVIDERS } from "../../src/modules/auth/application/ports/oauth-provider.js";
import type { OAuthProfile } from "../../src/modules/auth/domain/oauth.js";
import { Argon2PasswordHasher } from "../../src/modules/auth/infra/argon2-password-hasher.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri } from "../../src/platform/errors/problem-types.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "../support/create-test-app.js";
import { FakeOAuthProvider } from "../support/fake-oauth-provider.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const PASSWORD = "correct horse battery";
const ATTEMPT = "__Secure-vira_oauth";
const ACCESS = "__Host-vira_at";
const REFRESH = "__Secure-vira_rt";

/** Cookies a browser keeps between requests: set ones stay, cleared ones go. */
class Browser {
  readonly cookies = new Map<string, string>();
  readonly ip: string;

  constructor(ip: string) {
    this.ip = ip;
  }

  absorb(response: Response): Response {
    for (const header of (response.headers["set-cookie"] ?? []) as unknown as string[]) {
      const pair = header.slice(0, header.indexOf(";"));
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      if (value === "" || header.includes("Expires=Thu, 01 Jan 1970")) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function locationOf(response: Response): string {
  const location: unknown = response.headers["location"];
  if (typeof location !== "string") throw new Error("no Location header");
  return location;
}

describe.skipIf(!dockerAvailable)("social login (PostgreSQL + Redis, fake providers)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  const google = new FakeOAuthProvider("google");
  const github = new FakeOAuthProvider("github");

  let ipCounter = 0;
  const newBrowser = () => {
    ipCounter++;
    return new Browser(`10.30.${(ipCounter >> 8) & 255}.${ipCounter & 255}`);
  };

  const get = (browser: Browser, path: string) => {
    const call = request(testApp.app.getHttpServer())
      .get(`/api/v1${path}`)
      .set("X-Forwarded-For", browser.ip);
    return browser.cookies.size > 0 ? call.set("Cookie", browser.header()) : call;
  };

  /**
   * The whole round trip, as a browser does it: start, consent at the provider, callback.
   * Answers the callback's response.
   */
  async function socialLogin(
    provider: FakeOAuthProvider,
    profile: OAuthProfile,
    options: { browser?: Browser; next?: string } = {},
  ): Promise<{ browser: Browser; response: Response }> {
    const browser = options.browser ?? newBrowser();
    const next = options.next === undefined ? "" : `?next=${encodeURIComponent(options.next)}`;
    const started = browser.absorb(
      await get(browser, `/auth/oauth/${provider.name}${next}`).expect(302),
    );
    const authorization = new URL(locationOf(started));
    const code = provider.consent(authorization, profile);
    const state = authorization.searchParams.get("state") ?? "";
    const response = browser.absorb(
      await get(browser, `/auth/oauth/${provider.name}/callback?code=${code}&state=${state}`),
    );
    return { browser, response };
  }

  const profileFor = (email: string, overrides: Partial<OAuthProfile> = {}): OAuthProfile => ({
    accountId: uuidv7(),
    email,
    emailVerified: true,
    name: "Ana Souza",
    ...overrides,
  });
  const uniqueEmail = () => `o-${uuidv7()}@exemplo.com`;

  const auditActions = async (entityId: string) =>
    (await prisma.auditLog.findMany({ where: { entityId }, orderBy: { occurredAt: "asc" } })).map(
      (row) => row.action,
    );

  function passwordLogin(email: string) {
    return request(testApp.app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", newBrowser().ip)
      .set("Origin", TEST_WEB_ORIGIN)
      .send({ email, password: PASSWORD });
  }

  async function passwordAccount(email: string, verified: boolean): Promise<string> {
    const id = uuidv7();
    await prisma.user.create({
      data: {
        id,
        email,
        name: "Ana",
        passwordHash: await new Argon2PasswordHasher().hash(PASSWORD),
        emailVerifiedAt: verified ? new Date() : null,
        createdAt: new Date(),
      },
    });
    return id;
  }

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: {
        DATABASE_URL: infrastructure.databaseUrl,
        REDIS_URL: infrastructure.redisUrl,
        TRUST_PROXY_HOPS: "1",
      },
      override: (builder) =>
        builder.overrideProvider(OAUTH_PROVIDERS).useValue(
          new Map([
            ["google", google],
            ["github", github],
          ]),
        ),
    });
    prisma = testApp.app.get(PrismaService);
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  beforeEach(() => {
    google.exchanges.length = 0;
  });

  describe("a first login", () => {
    it("opens a verified account without a password, logs in and lands on the requested page", async () => {
      const email = uniqueEmail();
      const profile = profileFor(email);

      const { browser, response } = await socialLogin(google, profile, { next: "/eventos/x" });

      expect(response.status).toBe(302);
      expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/eventos/x`);
      expect(browser.cookies.has(ACCESS)).toBe(true);
      expect(browser.cookies.has(REFRESH)).toBe(true);
      expect(browser.cookies.has(ATTEMPT)).toBe(false);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user).toMatchObject({ name: "Ana Souza", role: "BUYER", passwordHash: null });
      expect(user.emailVerifiedAt).not.toBeNull();
      const links = await prisma.oAuthAccount.findMany({ where: { userId: user.id } });
      expect(links).toEqual([
        expect.objectContaining({ provider: "GOOGLE", providerAccountId: profile.accountId }),
      ]);

      // The session works like any other.
      const sessions = await get(browser, "/auth/sessions").expect(200);
      expect((sessions.body as SessionListResponse).data).toHaveLength(1);
      expect(await auditActions(user.id)).toEqual([
        "auth.registered",
        "auth.oauth_linked",
        "auth.login_succeeded",
      ]);
    });

    it("sends the provider the PKCE verifier and the callback it was registered with", async () => {
      await socialLogin(google, profileFor(uniqueEmail()));
      expect(google.exchanges).toEqual([
        expect.objectContaining({
          redirectUri: `${TEST_WEB_ORIGIN}/api/v1/auth/oauth/google/callback`,
          codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) as string,
        }),
      ]);
    });

    it("stores no provider token anywhere: the link table has only identifiers", async () => {
      const columns = await prisma.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'oauth_accounts' ORDER BY column_name`;
      expect(columns.map((c) => c.column_name)).toEqual([
        "created_at",
        "id",
        "provider",
        "provider_account_id",
        "user_id",
      ]);
    });

    it("lands on the home page without a return path", async () => {
      const { response } = await socialLogin(github, profileFor(uniqueEmail()));
      expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/`);
    });
  });

  describe("later logins", () => {
    it("return to the same account, even with another e-mail at the provider", async () => {
      const email = uniqueEmail();
      const profile = profileFor(email);
      await socialLogin(google, profile);

      const { response } = await socialLogin(google, { ...profile, email: uniqueEmail() });

      expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/`);
      const accounts = await prisma.oAuthAccount.findMany({
        where: { providerAccountId: profile.accountId },
      });
      expect(accounts).toHaveLength(1);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it("cannot reuse a code: the attempt and the code are both spent", async () => {
      const browser = newBrowser();
      const started = browser.absorb(await get(browser, "/auth/oauth/google").expect(302));
      const authorization = new URL(locationOf(started));
      const attemptCookie = browser.header();
      const code = google.consent(authorization, profileFor(uniqueEmail()));
      const callback = `/auth/oauth/google/callback?code=${code}&state=${authorization.searchParams.get("state") ?? ""}`;
      await get(browser, callback).expect(302);

      // Someone who captured the first callback and the attempt cookie replays both.
      const replay = request(testApp.app.getHttpServer())
        .get(`/api/v1${callback}`)
        .set("X-Forwarded-For", browser.ip)
        .set("Cookie", attemptCookie);
      const response = await replay.expect(302);
      expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/entrar?erro=oauth-failed`);
    });
  });

  describe("an e-mail that already has an account", () => {
    it("links a verified account; its password keeps working", async () => {
      const email = uniqueEmail();
      const id = await passwordAccount(email, true);

      const { browser } = await socialLogin(github, profileFor(email));

      expect(browser.cookies.has(ACCESS)).toBe(true);
      expect(await prisma.oAuthAccount.count({ where: { userId: id, provider: "GITHUB" } })).toBe(
        1,
      );
      await passwordLogin(email).expect(200);
    });

    it("takes over an account nobody verified: the squatter's password stops working", async () => {
      const email = uniqueEmail();
      const id = await passwordAccount(email, false);
      const before = await passwordLogin(email).expect(403);
      expect(problemDetailsSchema.parse(before.body).type).toBe(
        problemTypeUri("email-not-verified"),
      );

      const { browser } = await socialLogin(google, profileFor(email));

      expect(browser.cookies.has(ACCESS)).toBe(true);
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.passwordHash).toBeNull();
      expect(user.emailVerifiedAt).not.toBeNull();
      const after = await passwordLogin(email).expect(401);
      expect(problemDetailsSchema.parse(after.body).type).toBe(
        problemTypeUri("invalid-credentials"),
      );
      const linked = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: id, action: "auth.oauth_linked" },
      });
      expect(linked.metadata).toEqual({ provider: "google", tookOverUnverified: true });
    });

    it("gathers both providers on one account", async () => {
      const email = uniqueEmail();
      await socialLogin(google, profileFor(email));
      await socialLogin(github, profileFor(email, { name: "ana-gh" }));

      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { oauthAccounts: true },
      });
      expect(user.oauthAccounts.map((a) => a.provider).sort()).toEqual(["GITHUB", "GOOGLE"]);
      expect(user.name).toBe("Ana Souza");
    });
  });

  describe("an e-mail the provider does not vouch for", () => {
    it("opens no account, links nothing and sends the person back with the reason", async () => {
      const email = uniqueEmail();
      const profile = profileFor(email, { emailVerified: false });

      const { browser, response } = await socialLogin(github, profile);

      expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/entrar?erro=oauth-email-not-verified`);
      expect(browser.cookies.has(ACCESS)).toBe(false);
      expect(await prisma.user.count({ where: { email } })).toBe(0);
      expect(
        await prisma.oAuthAccount.count({ where: { providerAccountId: profile.accountId } }),
      ).toBe(0);
    });

    it("cannot be used to get into an existing account", async () => {
      const email = uniqueEmail();
      const id = await passwordAccount(email, true);

      const { response } = await socialLogin(google, profileFor(email, { emailVerified: false }));

      expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/entrar?erro=oauth-email-not-verified`);
      expect(await prisma.oAuthAccount.count({ where: { userId: id } })).toBe(0);
    });
  });

  it("two simultaneous first logins of one provider account open one account", async () => {
    const email = uniqueEmail();
    const profile = profileFor(email);

    const results = await Promise.all([socialLogin(google, profile), socialLogin(google, profile)]);

    for (const { response } of results) expect(locationOf(response)).toBe(`${TEST_WEB_ORIGIN}/`);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(
      await prisma.oAuthAccount.count({ where: { providerAccountId: profile.accountId } }),
    ).toBe(1);
  });

  it("ends the session the browser had before logging in again", async () => {
    const email = uniqueEmail();
    const profile = profileFor(email);
    const { browser } = await socialLogin(google, profile);
    const firstRefresh = browser.cookies.get(REFRESH) ?? "";

    await socialLogin(google, profile, { browser });

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const sessions = await prisma.session.findMany({ where: { userId: user.id } });
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.revokedAt === null)).toHaveLength(1);
    expect(browser.cookies.get(REFRESH)).not.toBe(firstRefresh);
  });
});
