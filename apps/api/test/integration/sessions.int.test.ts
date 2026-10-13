import { createHash } from "node:crypto";

import { problemDetailsSchema, sessionListResponseSchema } from "@vira/shared";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Argon2PasswordHasher } from "../../src/modules/auth/infra/argon2-password-hasher.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri, type ProblemType } from "../../src/platform/errors/problem-types.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const PASSWORD = "correct horse battery";
const ACCESS = "__Host-vira_at";
const REFRESH = "__Secure-vira_rt";
const CSRF = "__Host-vira_csrf";
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A clock the tests move by hand (token and session expiry). */
const clock = { current: new Date(), now: () => clock.current };
const advance = (ms: number) => {
  clock.current = new Date(clock.current.getTime() + ms);
};

interface SetCookie {
  readonly value: string;
  /** Lower-cased attribute names, with their value ("" for flags). */
  readonly attributes: Readonly<Record<string, string>>;
}

function setCookiesOf(response: Response): Record<string, SetCookie> {
  const headers = (response.headers["set-cookie"] ?? []) as unknown as string[];
  return Object.fromEntries(
    headers.map((header) => {
      const [pair = "", ...attributes] = header.split(";").map((part) => part.trim());
      const separator = pair.indexOf("=");
      return [
        pair.slice(0, separator),
        {
          value: decodeURIComponent(pair.slice(separator + 1)),
          attributes: Object.fromEntries(
            attributes.map((attribute) => {
              const [name = "", value = ""] = attribute.split("=");
              return [name.toLowerCase(), value];
            }),
          ),
        },
      ];
    }),
  );
}

/** What a browser keeps between requests: set cookies stay, cleared ones go. */
class Browser {
  readonly cookies = new Map<string, string>();
  csrfToken: string | undefined;

  absorb(response: Response): Response {
    for (const [name, cookie] of Object.entries(setCookiesOf(response))) {
      if (cookie.value === "" || cookie.attributes["max-age"] === "0") this.cookies.delete(name);
      else if (cookie.attributes["expires"] && new Date(cookie.attributes["expires"]) < new Date())
        this.cookies.delete(name);
      else this.cookies.set(name, cookie.value);
    }
    return response;
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

describe.skipIf(!dockerAvailable)("sessions and CSRF (PostgreSQL + Redis)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  let passwordHash: string;

  let ipCounter = 0;
  /** A fresh client address per browser, so rate limits never leak between tests. */
  const nextIp = () => {
    ipCounter++;
    return `10.20.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
  };

  const api = () => request(testApp.app.getHttpServer());

  /** A request from `browser`, as the web proxy forwards it: same origin, its cookies. */
  function send(
    browser: Browser & { ip?: string },
    method: "get" | "post" | "delete",
    path: string,
    options: { csrf?: boolean } = {},
  ) {
    const call = api()
      [method](`/api/v1${path}`)
      .set("X-Forwarded-For", browser.ip ?? "10.0.0.1");
    if (method !== "get") call.set("Origin", TEST_WEB_ORIGIN);
    if (browser.cookies.size > 0) call.set("Cookie", browser.header());
    if (options.csrf && browser.csrfToken) call.set("X-CSRF-Token", browser.csrfToken);
    return call;
  }

  async function verifiedUser(): Promise<{ id: string; email: string }> {
    const id = uuidv7();
    const email = `s-${id}@exemplo.com`;
    await prisma.user.create({
      data: {
        id,
        email,
        name: "Ana Souza",
        passwordHash,
        emailVerifiedAt: clock.current,
        createdAt: clock.current,
      },
    });
    return { id, email };
  }

  async function loggedIn(email: string, browser = Object.assign(new Browser(), { ip: nextIp() })) {
    const response = await send(browser, "post", "/auth/login")
      .send({ email, password: PASSWORD })
      .expect(200);
    browser.absorb(response);
    return { browser, response };
  }

  async function fetchCsrf(browser: Browser & { ip?: string }): Promise<Response> {
    const response = await send(browser, "get", "/auth/csrf").expect(200);
    browser.absorb(response);
    browser.csrfToken = (response.body as { csrfToken: string }).csrfToken;
    return response;
  }

  const familyOf = (refreshToken: string) =>
    prisma.session
      .findUniqueOrThrow({ where: { tokenHash: new Uint8Array(sha256(refreshToken)) } })
      .then((row) => prisma.session.findMany({ where: { familyId: row.familyId } }));

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: {
        DATABASE_URL: infrastructure.databaseUrl,
        REDIS_URL: infrastructure.redisUrl,
        TRUST_PROXY_HOPS: "1",
      },
      override: (builder) => builder.overrideProvider(CLOCK).useValue(clock),
    });
    prisma = testApp.app.get(PrismaService);
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  describe("cookies", () => {
    it("sets the access and refresh cookies with the documented flags on login", async () => {
      const { email } = await verifiedUser();
      const { response } = await loggedIn(email);
      const cookies = setCookiesOf(response);

      expect(cookies[ACCESS]?.attributes).toEqual({
        "max-age": "600",
        path: "/",
        expires: expect.any(String) as string,
        httponly: "",
        secure: "",
        samesite: "Lax",
      });
      expect(cookies[REFRESH]?.attributes).toEqual({
        "max-age": String(7 * 24 * 60 * 60),
        path: "/api/v1/auth",
        expires: expect.any(String) as string,
        httponly: "",
        secure: "",
        samesite: "Lax",
      });
      // No Domain anywhere: a __Host- cookie with one is rejected by the browser.
      for (const cookie of Object.values(cookies))
        expect(cookie.attributes).not.toHaveProperty("domain");
    });

    it("stores only the SHA-256 of the refresh token", async () => {
      const { email, id } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const token = browser.cookies.get(REFRESH) ?? "";

      const [row] = await prisma.session.findMany({ where: { userId: id } });
      expect(Buffer.from(row?.tokenHash ?? [])).toEqual(sha256(token));
      const raw = await prisma.$queryRaw<{ dump: string }[]>`
        SELECT row_to_json(s)::text AS dump FROM sessions s WHERE user_id = ${id}::uuid`;
      expect(raw[0]?.dump).not.toContain(token);
    });

    it("sets the CSRF cookie with the documented flags", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const response = await fetchCsrf(browser);

      expect(setCookiesOf(response)[CSRF]).toEqual({
        value: browser.csrfToken,
        attributes: { path: "/", httponly: "", secure: "", samesite: "Lax" },
      });
    });
  });

  describe("access token", () => {
    it("authenticates requests with the cookie until it expires after ten minutes", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);

      await send(browser, "get", "/auth/sessions").expect(200);
      advance(10 * MINUTE);
      expectProblem(await send(browser, "get", "/auth/sessions").expect(401), "unauthenticated");

      browser.absorb(await send(browser, "post", "/auth/refresh").expect(204));
      await send(browser, "get", "/auth/sessions").expect(200);
    });

    it("works as a Bearer token for clients that are not browsers, without CSRF", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const bearer = `Bearer ${browser.cookies.get(ACCESS) ?? ""}`;

      await api().get("/api/v1/auth/sessions").set("Authorization", bearer).expect(200);
      await api().post("/api/v1/auth/logout").set("Authorization", bearer).expect(204);
      await send(browser, "post", "/auth/refresh").expect(401);
    });
  });

  describe("refresh rotation", () => {
    it("rotates the refresh token and keeps the session id", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const before = browser.cookies.get(REFRESH) ?? "";
      const [sessionBefore] = sessionListResponseSchema.parse(
        (await send(browser, "get", "/auth/sessions").expect(200)).body,
      ).data;

      advance(MINUTE);
      const response = browser.absorb(await send(browser, "post", "/auth/refresh").expect(204));
      const after = browser.cookies.get(REFRESH) ?? "";

      expect(after).not.toBe(before);
      expect(setCookiesOf(response)[ACCESS]).toBeDefined();
      const family = await familyOf(after);
      expect(family).toHaveLength(2);
      expect(family.find((row) => row.rotatedAt !== null)?.tokenHash).toEqual(
        new Uint8Array(sha256(before)),
      );
      const [sessionAfter] = sessionListResponseSchema.parse(
        (await send(browser, "get", "/auth/sessions").expect(200)).body,
      ).data;
      expect(sessionAfter?.id).toBe(sessionBefore?.id);
      expect(sessionAfter?.lastRefreshedAt).toBe(clock.current.toISOString());
    });

    it("revokes the whole family when an old refresh token is used again", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const stolen = browser.cookies.get(REFRESH) ?? "";
      browser.absorb(await send(browser, "post", "/auth/refresh").expect(204));

      // The thief replays the token the owner already exchanged.
      const thief = Object.assign(new Browser(), { ip: nextIp() });
      thief.cookies.set(REFRESH, stolen);
      const replay = await send(thief, "post", "/auth/refresh").expect(401);
      expectProblem(replay, "unauthenticated");
      expect(setCookiesOf(replay)[REFRESH]?.attributes["expires"]).toBe(
        "Thu, 01 Jan 1970 00:00:00 GMT",
      );

      // The owner's newest token died with the family.
      await send(browser, "post", "/auth/refresh").expect(401);
      const family = await familyOf(stolen);
      expect(family.every((row) => row.revokedAt !== null)).toBe(true);
      expect(new Set(family.map((row) => row.revokeReason))).toEqual(new Set(["REUSE_DETECTED"]));

      const audit = await prisma.auditLog.findMany({
        where: { action: "auth.refresh_reuse_detected", entityId: family[0]?.familyId ?? "" },
      });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ entityType: "session", actorId: null, actorRole: "SYSTEM" });
    });

    it("lets exactly one of two simultaneous refreshes with the same token rotate it", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const token = browser.cookies.get(REFRESH) ?? "";

      const statuses = (
        await Promise.all([
          send(browser, "post", "/auth/refresh"),
          send(browser, "post", "/auth/refresh"),
        ])
      ).map((response) => response.status);

      const family = await familyOf(token);
      expect(family.filter((row) => row.rotatedAt !== null)).toHaveLength(1);
      expect(family.length).toBeLessThanOrEqual(2);
      // The loser presented a token that was rotated under it: treated as reuse.
      expect(statuses.sort()).toEqual([204, 401]);
      expect(family.every((row) => row.revokedAt !== null)).toBe(true);
    });

    it("ends a session left unused for seven days, and any session after thirty", async () => {
      const { email } = await verifiedUser();
      const idle = await loggedIn(email);
      const busy = await loggedIn(email);

      // Refreshed on days 5, 10, 15, 20 and 25; the idle one is gone by day 10.
      for (let refresh = 1; refresh <= 5; refresh++) {
        advance(5 * DAY);
        busy.browser.absorb(await send(busy.browser, "post", "/auth/refresh").expect(204));
        if (refresh === 2) await send(idle.browser, "post", "/auth/refresh").expect(401);
      }
      // Day 30: refreshing every five days is no longer enough.
      advance(5 * DAY);
      await send(busy.browser, "post", "/auth/refresh").expect(401);
    });

    it("refuses a missing refresh cookie and limits refreshes per address", async () => {
      const anonymous = Object.assign(new Browser(), { ip: nextIp() });
      expectProblem(await send(anonymous, "post", "/auth/refresh").expect(401), "unauthenticated");

      for (let i = 1; i < 30; i++) await send(anonymous, "post", "/auth/refresh").expect(401);
      const limited = await send(anonymous, "post", "/auth/refresh").expect(429);
      expect(limited.headers["retry-after"]).toBeDefined();
    });
  });

  describe("CSRF", () => {
    it("refuses a state-changing request with the session cookie but no token", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);

      expectProblem(await send(browser, "post", "/auth/logout").expect(403), "csrf-failed");
      await fetchCsrf(browser);
      browser.csrfToken = undefined;
      expectProblem(await send(browser, "post", "/auth/logout").expect(403), "csrf-failed");

      // Still logged in: nothing was revoked.
      await send(browser, "post", "/auth/refresh").expect(204);
    });

    it("refuses a token from another session, even with matching cookie and header", async () => {
      const { email } = await verifiedUser();
      const mine = await loggedIn(email);
      const other = await loggedIn(email);
      await fetchCsrf(other.browser);

      mine.browser.cookies.set(CSRF, other.browser.cookies.get(CSRF) ?? "");
      mine.browser.csrfToken = other.browser.csrfToken;
      expectProblem(
        await send(mine.browser, "post", "/auth/logout", { csrf: true }).expect(403),
        "csrf-failed",
      );
    });

    it("issues the token from the refresh cookie once the access token has expired", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      advance(11 * MINUTE);

      await fetchCsrf(browser);
      browser.absorb(await send(browser, "post", "/auth/refresh").expect(204));
      // Same session after the refresh, so the token still works.
      await send(browser, "post", "/auth/logout", { csrf: true }).expect(204);
    });

    it("answers 401 for a CSRF token without any session", async () => {
      const anonymous = Object.assign(new Browser(), { ip: nextIp() });
      expectProblem(await send(anonymous, "get", "/auth/csrf").expect(401), "unauthenticated");
    });

    it("refuses a login posted from another origin and opens no session", async () => {
      const { email, id } = await verifiedUser();
      const response = await api()
        .post("/api/v1/auth/login")
        .set("Origin", "https://evil.example")
        .set("X-Forwarded-For", nextIp())
        .send({ email, password: PASSWORD })
        .expect(403);
      expectProblem(response, "csrf-failed");
      expect(response.headers["set-cookie"]).toBeUndefined();
      expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    });
  });

  describe("logout", () => {
    it("revokes the current session, clears the cookies and leaves the others", async () => {
      const { email } = await verifiedUser();
      const phone = await loggedIn(email);
      const laptop = await loggedIn(email);
      await fetchCsrf(laptop.browser);
      const refreshToken = laptop.browser.cookies.get(REFRESH) ?? "";

      const response = await send(laptop.browser, "post", "/auth/logout", { csrf: true }).expect(
        204,
      );
      laptop.browser.absorb(response);

      expect(laptop.browser.cookies.size).toBe(0);
      expect(setCookiesOf(response)[REFRESH]?.attributes["path"]).toBe("/api/v1/auth");
      const family = await familyOf(refreshToken);
      expect(family.every((row) => row.revokeReason === "LOGOUT")).toBe(true);

      laptop.browser.cookies.set(REFRESH, refreshToken);
      await send(laptop.browser, "post", "/auth/refresh").expect(401);
      await send(phone.browser, "post", "/auth/refresh").expect(204);
    });

    it("logout-all revokes every session of the account and audits it", async () => {
      const { email, id } = await verifiedUser();
      const someone = await verifiedUser();
      const phone = await loggedIn(email);
      const laptop = await loggedIn(email);
      const unrelated = await loggedIn(someone.email);
      await fetchCsrf(laptop.browser);

      await send(laptop.browser, "post", "/auth/logout-all", { csrf: true }).expect(204);

      await send(phone.browser, "post", "/auth/refresh").expect(401);
      await send(laptop.browser, "post", "/auth/refresh").expect(401);
      await send(unrelated.browser, "post", "/auth/refresh").expect(204);
      const audit = await prisma.auditLog.findMany({
        where: { action: "auth.logout_all", entityId: id },
      });
      expect(audit.map((entry) => entry.metadata)).toEqual([{ revokedSessions: 2 }]);
      expect(audit[0]?.actorId).toBe(id);
    });

    it("logging in again ends the session the browser held before", async () => {
      const { email } = await verifiedUser();
      const { browser } = await loggedIn(email);
      const previous = browser.cookies.get(REFRESH) ?? "";

      await loggedIn(email, browser);

      expect((await familyOf(previous)).every((row) => row.revokedAt !== null)).toBe(true);
      await send(browser, "post", "/auth/refresh").expect(204);
    });
  });

  describe("session list", () => {
    it("lists the account's active sessions and revokes one by id", async () => {
      const { email } = await verifiedUser();
      const phone = await loggedIn(email);
      advance(1000);
      const laptop = await loggedIn(email);
      await fetchCsrf(laptop.browser);

      const listed = sessionListResponseSchema.parse(
        (await send(laptop.browser, "get", "/auth/sessions").expect(200)).body,
      ).data;
      expect(listed.map((session) => session.current)).toEqual([true, false]);
      const phoneSession = listed[1]?.id ?? "";

      await send(laptop.browser, "delete", `/auth/sessions/${phoneSession}`, {
        csrf: true,
      }).expect(204);
      await send(phone.browser, "post", "/auth/refresh").expect(401);
      expectProblem(
        await send(laptop.browser, "delete", `/auth/sessions/${phoneSession}`, {
          csrf: true,
        }).expect(404),
        "not-found",
      );
    });

    it("answers 404 for another account's session and 400 for a malformed id", async () => {
      const mine = await loggedIn((await verifiedUser()).email);
      const theirs = await loggedIn((await verifiedUser()).email);
      await fetchCsrf(mine.browser);
      const [theirSession] = sessionListResponseSchema.parse(
        (await send(theirs.browser, "get", "/auth/sessions").expect(200)).body,
      ).data;

      expectProblem(
        await send(mine.browser, "delete", `/auth/sessions/${theirSession?.id ?? ""}`, {
          csrf: true,
        }).expect(404),
        "not-found",
      );
      await send(theirs.browser, "post", "/auth/refresh").expect(204);
      expectProblem(
        await send(mine.browser, "delete", "/auth/sessions/not-a-uuid", { csrf: true }).expect(400),
        "validation-failed",
      );
    });

    it("revoking the current session also clears its cookies", async () => {
      const { browser } = await loggedIn((await verifiedUser()).email);
      await fetchCsrf(browser);
      const [current] = sessionListResponseSchema.parse(
        (await send(browser, "get", "/auth/sessions").expect(200)).body,
      ).data;

      browser.absorb(
        await send(browser, "delete", `/auth/sessions/${current?.id ?? ""}`, { csrf: true }).expect(
          204,
        ),
      );
      expect(browser.cookies.size).toBe(0);
    });
  });

  describe("database constraints", () => {
    it("rejects a hash that is not SHA-256 and a revocation without a reason", async () => {
      const { id } = await verifiedUser();
      const now = clock.current;
      const base = {
        userId: id,
        familyId: uuidv7(),
        authenticatedAt: now,
        createdAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 30 * DAY),
        expiresAt: new Date(now.getTime() + 7 * DAY),
      };

      await expect(
        prisma.session.create({
          data: { ...base, id: uuidv7(), tokenHash: new Uint8Array(16) },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.session.create({
          data: { ...base, id: uuidv7(), tokenHash: new Uint8Array(32), revokedAt: now },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.session.create({
          data: {
            ...base,
            id: uuidv7(),
            tokenHash: new Uint8Array(32).fill(1),
            expiresAt: new Date(now.getTime() + 31 * DAY),
          },
        }),
      ).rejects.toThrow();
    });
  });
});
