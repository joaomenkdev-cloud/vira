import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { accountSchema, problemDetailsSchema } from "@vira/shared";
import { Redis } from "ioredis";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
import { MailpitInbox, type ReceivedMail } from "../support/mailpit-inbox.js";

const dockerAvailable = await dockerAvailableOrSkip();

const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "a brand new passphrase";
/** The only password the fake Pwned Passwords service below knows as leaked. */
const LEAKED = "password123";
const MINUTE = 60 * 1000;

/** A clock the tests move by hand (link expiry). */
const clock = { current: new Date(), now: () => clock.current };
const advance = (ms: number) => {
  clock.current = new Date(clock.current.getTime() + ms);
};

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex").toUpperCase();
const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** api.pwnedpasswords.com's range endpoint, knowing one leaked password. */
async function startFakePwnedPasswords(): Promise<{
  url: string;
  prefixes: string[];
  server: Server;
}> {
  const prefixes: string[] = [];
  const server = createServer((req, res) => {
    const prefix = (req.url ?? "").replace("/range/", "");
    prefixes.push(prefix);
    const lines = ["0018A45C4D1DEF81644B54AB7F969B88D65:1"];
    if (prefix === sha1(LEAKED).slice(0, 5)) lines.push(`${sha1(LEAKED).slice(5)}:2254650`);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(lines.join("\r\n"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, prefixes, server };
}

/** What a browser keeps between requests: set cookies stay, cleared ones go. */
class Browser {
  readonly cookies = new Map<string, string>();
  csrfToken: string | undefined;
  constructor(readonly ip: string) {}

  absorb(response: Response): Response {
    for (const header of (response.headers["set-cookie"] ?? []) as unknown as string[]) {
      const [pair = ""] = header.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = decodeURIComponent(pair.slice(separator + 1));
      if (value === "" || /max-age=0/i.test(header)) this.cookies.delete(name);
      else this.cookies.set(name, value);
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

function tokenIn(mail: ReceivedMail | undefined, path: string): string {
  const match = new RegExp(`${path}#token=([A-Za-z0-9_-]{43})`).exec(mail?.text ?? "");
  if (!match?.[1]) throw new Error(`The e-mail has no ${path} link`);
  return match[1];
}

/** What an observer can compare between two responses: everything except per-request noise. */
function observable(response: Response) {
  const noise = new Set(["date", "x-request-id", "ratelimit-remaining", "ratelimit-reset", "etag"]);
  const headers = Object.fromEntries(
    Object.entries(response.headers).filter(([name]) => !noise.has(name)),
  );
  const { requestId: _requestId, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, headers, body };
}

describe.skipIf(!dockerAvailable)(
  "password reset, account and organizer profile (PostgreSQL + Redis + Mailpit)",
  () => {
    let infrastructure: Infrastructure;
    let testApp: TestApp;
    let prisma: PrismaService;
    let inbox: MailpitInbox;
    let redis: Redis;
    let pwned: Awaited<ReturnType<typeof startFakePwnedPasswords>>;
    let passwordHash: string;

    let ipCounter = 0;
    const nextIp = () => {
      ipCounter++;
      return `10.40.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
    };
    const api = () => request(testApp.app.getHttpServer());

    /** A request from `browser`, as the web proxy forwards it: same origin, its cookies. */
    function send(
      browser: Browser,
      method: "get" | "post" | "patch",
      path: string,
      options: { csrf?: boolean } = {},
    ) {
      const call = api()[method](`/api/v1${path}`).set("X-Forwarded-For", browser.ip);
      if (method !== "get") call.set("Origin", TEST_WEB_ORIGIN);
      if (browser.cookies.size > 0) call.set("Cookie", browser.header());
      if (options.csrf && browser.csrfToken) call.set("X-CSRF-Token", browser.csrfToken);
      return call;
    }

    async function user(
      overrides: { passwordHash?: string | null; role?: "BUYER" | "ADMIN" } = {},
    ): Promise<{ id: string; email: string }> {
      const id = uuidv7();
      const email = `a-${randomBytes(4).toString("hex")}@exemplo.com`;
      await prisma.user.create({
        data: {
          id,
          email,
          name: "Ana Souza",
          passwordHash:
            overrides.passwordHash === undefined ? passwordHash : overrides.passwordHash,
          role: overrides.role ?? "BUYER",
          emailVerifiedAt: clock.current,
          createdAt: clock.current,
        },
      });
      return { id, email };
    }

    /** A logged-in browser with its CSRF token, ready to call the account routes. */
    async function loggedIn(email: string, password = PASSWORD): Promise<Browser> {
      const browser = new Browser(nextIp());
      browser.absorb(
        await send(browser, "post", "/auth/login").send({ email, password }).expect(200),
      );
      const csrf = await send(browser, "get", "/auth/csrf").expect(200);
      browser.absorb(csrf);
      browser.csrfToken = (csrf.body as { csrfToken: string }).csrfToken;
      return browser;
    }

    const refresh = (browser: Browser) => send(browser, "post", "/auth/refresh");
    const login = (email: string, password: string) =>
      api().post("/api/v1/auth/login").set("X-Forwarded-For", nextIp()).send({ email, password });
    const forgot = (email: string, ip = nextIp()) =>
      api().post("/api/v1/auth/password/forgot").set("X-Forwarded-For", ip).send({ email });
    const reset = (token: string, password: string) =>
      api()
        .post("/api/v1/auth/password/reset")
        .set("X-Forwarded-For", nextIp())
        .send({ token, password });

    async function resetLink(email: string, count = 1): Promise<string> {
      await forgot(email).expect(202);
      const mails = await inbox.waitFor(email, count);
      return tokenIn(mails.at(-1), "/redefinir-senha");
    }

    const accessRoleOf = (browser: Browser) => {
      const token = browser.cookies.get("__Host-vira_at") ?? "";
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
      ) as {
        role: string;
      };
      return payload.role;
    };

    beforeAll(async () => {
      pwned = await startFakePwnedPasswords();
      infrastructure = await startInfrastructure({ mail: true });
      if (!infrastructure.mailpit) throw new Error("Mailpit did not start");
      inbox = new MailpitInbox(infrastructure.mailpit);
      redis = new Redis(infrastructure.redisUrl);
      testApp = await createTestApp({
        env: {
          DATABASE_URL: infrastructure.databaseUrl,
          REDIS_URL: infrastructure.redisUrl,
          SMTP_URL: infrastructure.mailpit.smtpUrl,
          WORKER_MODE: "embedded",
          OUTBOX_POLL_INTERVAL_MS: "100",
          TRUST_PROXY_HOPS: "1",
          PWNED_PASSWORDS_ENABLED: "true",
          PWNED_PASSWORDS_URL: pwned.url,
        },
        override: (builder) => builder.overrideProvider(CLOCK).useValue(clock),
      });
      prisma = testApp.app.get(PrismaService);
      passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    });

    afterAll(async () => {
      await testApp.app.close();
      redis.disconnect();
      await infrastructure.stop();
      pwned.server.close();
    });

    beforeEach(async () => {
      // Per-account budgets are keyed by account; tests use fresh accounts, but the
      // current-password budget must not leak between the tests of one account.
      const keys = await redis.keys("rl:auth.current_password.account:*");
      if (keys.length > 0) await redis.del(...keys);
    });

    describe("forgot and reset", () => {
      it("answers a known and an unknown address with the same 202", async () => {
        const { email } = await user();
        const ip = nextIp();
        const known = await forgot(email, ip).expect(202);
        const unknown = await forgot(`ninguem-${uuidv7()}@exemplo.com`, ip).expect(202);
        expect(known.body).toEqual({ status: "accepted" });
        expect(observable(unknown)).toEqual(observable(known));
        await inbox.waitFor(email);
      });

      it("resets the password, ends every session and tells the owner", async () => {
        const { id, email } = await user();
        const before = await loggedIn(email);
        const token = await resetLink(email);

        const response = await reset(token, NEW_PASSWORD).expect(204);
        expect(response.body).toEqual({});

        // The old session cannot be refreshed any more.
        await refresh(before).expect(401);
        const sessions = await prisma.session.findMany({ where: { userId: id } });
        expect(sessions.every((s) => s.revokeReason === "PASSWORD_CHANGED")).toBe(true);

        await login(email, PASSWORD).expect(401);
        await login(email, NEW_PASSWORD).expect(200);

        const mails = await inbox.waitFor(email, 2);
        expect(mails.at(-1)?.subject).toBe("Sua senha na Vira foi alterada");

        const audit = await prisma.auditLog.findMany({
          where: { entityId: id, action: "auth.password_changed" },
        });
        expect(audit.map((entry) => entry.metadata)).toEqual([{ via: "reset" }]);
      });

      it("keeps only the token's hash, and accepts it once even when sent twice at once", async () => {
        const { id, email } = await user();
        const token = await resetLink(email);

        const rows = await prisma.verificationToken.findMany({
          where: { userId: id, purpose: "PASSWORD_RESET" },
        });
        expect(rows).toHaveLength(1);
        expect(Buffer.from(rows[0]?.tokenHash ?? [])).toEqual(sha256(token));
        expect(JSON.stringify(rows)).not.toContain(token);

        const results = await Promise.all([
          reset(token, NEW_PASSWORD),
          reset(token, "another long passphrase"),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([204, 410]);
      });

      it("refuses an expired link with 410", async () => {
        const { email } = await user();
        const token = await resetLink(email);
        advance(31 * MINUTE);
        expectProblem(await reset(token, NEW_PASSWORD).expect(410), "token-expired");
        await login(email, PASSWORD).expect(200);
      });

      it("refuses a leaked password (checked by k-anonymity) and keeps the link usable", async () => {
        const { email } = await user();
        const token = await resetLink(email);
        pwned.prefixes.length = 0;

        const refused = await reset(token, LEAKED).expect(400);
        expectProblem(refused, "breached-password");
        expect(pwned.prefixes).toEqual([sha1(LEAKED).slice(0, 5)]);

        await reset(token, NEW_PASSWORD).expect(204);
      });

      it("lets an account that only used social login create its first password", async () => {
        const { email } = await user({ passwordHash: null });
        await reset(await resetLink(email), NEW_PASSWORD).expect(204);
        await login(email, NEW_PASSWORD).expect(200);
      });
    });

    describe("sign-up", () => {
      it("refuses a leaked password with 400 and creates nothing", async () => {
        const email = `novo-${uuidv7()}@exemplo.com`;
        const response = await api()
          .post("/api/v1/auth/register")
          .set("X-Forwarded-For", nextIp())
          .send({ name: "Ana", email, password: LEAKED })
          .expect(400);
        expectProblem(response, "breached-password");
        expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      });
    });

    describe("GET and PATCH /me", () => {
      it("shows the account of the session, with no credentials", async () => {
        const { id, email } = await user();
        const browser = await loggedIn(email);

        const response = await send(browser, "get", "/me").expect(200);
        expect(accountSchema.parse(response.body)).toEqual({
          id,
          name: "Ana Souza",
          email,
          role: "BUYER",
          emailVerified: true,
          hasPassword: true,
        });
      });

      it("renames the account", async () => {
        const { id, email } = await user();
        const browser = await loggedIn(email);

        const response = await send(browser, "patch", "/me", { csrf: true })
          .send({ name: "  Ana S.  " })
          .expect(200);
        expect((response.body as { user: { name: string } }).user.name).toBe("Ana S.");
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).name).toBe("Ana S.");
      });

      it("never applies a role, e-mail or verification from the body", async () => {
        const { id, email } = await user();
        const browser = await loggedIn(email);

        for (const extra of [
          { role: "ADMIN" },
          { email: "x@exemplo.com" },
          { emailVerified: false },
        ]) {
          await send(browser, "patch", "/me", { csrf: true })
            .send({ name: "Mallory", ...extra })
            .expect(400);
        }
        expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
          name: "Ana Souza",
          role: "BUYER",
          email,
        });
      });

      it("requires the CSRF token with the session cookie", async () => {
        const { email } = await user();
        const browser = await loggedIn(email);
        expectProblem(
          await send(browser, "patch", "/me").send({ name: "Sem token" }).expect(403),
          "csrf-failed",
        );
      });
    });

    describe("POST /me/password", () => {
      it("changes the password, keeps this session and ends the others", async () => {
        const { email } = await user();
        const current = await loggedIn(email);
        const other = await loggedIn(email);

        await send(current, "post", "/me/password", { csrf: true })
          .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
          .expect(204);

        current.absorb(await refresh(current).expect(204));
        await refresh(other).expect(401);
        await login(email, NEW_PASSWORD).expect(200);
        expect((await inbox.waitFor(email)).at(-1)?.subject).toBe("Sua senha na Vira foi alterada");
      });

      it("refuses a wrong current password with 400, and a leaked new one", async () => {
        const { email } = await user();
        const browser = await loggedIn(email);

        expectProblem(
          await send(browser, "post", "/me/password", { csrf: true })
            .send({ currentPassword: "not it", newPassword: NEW_PASSWORD })
            .expect(400),
          "incorrect-password",
        );
        const leaked = await send(browser, "post", "/me/password", { csrf: true })
          .send({ currentPassword: PASSWORD, newPassword: LEAKED })
          .expect(400);
        expectProblem(leaked, "breached-password");
        expect(problemDetailsSchema.parse(leaked.body).errors?.[0]?.path).toBe("newPassword");
        await login(email, PASSWORD).expect(200);
      });

      it("answers 429 after five guesses at the current password", async () => {
        const { email } = await user();
        const browser = await loggedIn(email);
        for (let i = 0; i < 5; i++) {
          await send(browser, "post", "/me/password", { csrf: true })
            .send({ currentPassword: `guess ${i}`, newPassword: NEW_PASSWORD })
            .expect(400);
        }
        await send(browser, "post", "/me/password", { csrf: true })
          .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
          .expect(429);
      });

      it("answers 409 for an account without a password", async () => {
        const { id } = await user({ passwordHash: null });
        // No password to log in with: open a session the way a social login would.
        const { email } = await prisma.user.update({ where: { id }, data: { passwordHash } });
        const browser = await loggedIn(email);
        await prisma.user.update({ where: { id }, data: { passwordHash: null } });

        expectProblem(
          await send(browser, "post", "/me/password", { csrf: true })
            .send({ currentPassword: "anything", newPassword: NEW_PASSWORD })
            .expect(409),
          "password-not-set",
        );
      });
    });

    describe("e-mail change", () => {
      it("moves the account only after the link sent to the new address is used", async () => {
        const { id, email } = await user();
        const newEmail = `nova-${randomBytes(4).toString("hex")}@exemplo.com`;
        const browser = await loggedIn(email);

        await send(browser, "post", "/me/email", { csrf: true })
          .send({ email: newEmail, currentPassword: PASSWORD })
          .expect(202);

        const [confirmation] = await inbox.waitFor(newEmail);
        const [notice] = await inbox.waitFor(email);
        expect(notice?.text).not.toContain("#token=");
        const token = tokenIn(confirmation, "/confirmar-email");
        // Still the old address, and the link is bound to the new one in the database.
        expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
          email,
          pendingEmail: newEmail,
        });
        const row = await prisma.verificationToken.findFirstOrThrow({
          where: { userId: id, purpose: "EMAIL_CHANGE" },
        });
        expect(row.newEmail).toBe(newEmail);

        await api()
          .post("/api/v1/auth/email/change/confirm")
          .set("X-Forwarded-For", nextIp())
          .send({ token })
          .expect(204);

        expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
          email: newEmail,
          pendingEmail: null,
        });
        await login(newEmail, PASSWORD).expect(200);
        await login(email, PASSWORD).expect(401);
        // The session it was asked from is still fine.
        await refresh(browser).expect(204);
      });

      it("answers the same for an address that has an account, whose owner is told", async () => {
        const { id, email } = await user();
        const holder = await user();
        const browser = await loggedIn(email);

        const response = await send(browser, "post", "/me/email", { csrf: true })
          .send({ email: holder.email, currentPassword: PASSWORD })
          .expect(202);
        expect(response.body).toEqual({ status: "accepted" });

        const [notice] = await inbox.waitFor(holder.email);
        expect(notice?.subject).toBe("Tentativa de usar seu e-mail na Vira");
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).pendingEmail).toBeNull();
      });

      it("refuses the link once another account took the address", async () => {
        const { email } = await user();
        const newEmail = `nova-${randomBytes(4).toString("hex")}@exemplo.com`;
        const browser = await loggedIn(email);
        await send(browser, "post", "/me/email", { csrf: true })
          .send({ email: newEmail, currentPassword: PASSWORD })
          .expect(202);
        const token = tokenIn((await inbox.waitFor(newEmail))[0], "/confirmar-email");
        await prisma.user.create({
          data: { id: uuidv7(), email: newEmail, name: "Bia", createdAt: clock.current },
        });

        expectProblem(
          await api()
            .post("/api/v1/auth/email/change/confirm")
            .set("X-Forwarded-For", nextIp())
            .send({ token })
            .expect(410),
          "token-expired",
        );
      });
    });

    describe("POST /me/organizer", () => {
      it("creates the profile, makes the account ORGANIZER and the next refresh carries it", async () => {
        const { id, email } = await user();
        const browser = await loggedIn(email);

        const response = await send(browser, "post", "/me/organizer", { csrf: true })
          .send({ displayName: "Coletivo São João" })
          .expect(201);
        expect(response.body).toEqual({
          organizerProfile: {
            displayName: "Coletivo São João",
            slug: expect.stringMatching(/^coletivo-sao-joao/) as string,
          },
        });
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe("ORGANIZER");

        expect(accessRoleOf(browser)).toBe("BUYER");
        browser.absorb(await refresh(browser).expect(204));
        expect(accessRoleOf(browser)).toBe("ORGANIZER");

        const me = accountSchema.parse((await send(browser, "get", "/me").expect(200)).body);
        expect(me.organizer?.displayName).toBe("Coletivo São João");

        expectProblem(
          await send(browser, "post", "/me/organizer", { csrf: true })
            .send({ displayName: "Outro" })
            .expect(409),
          "already-organizer",
        );
      });

      it("gives two organizers with the same name different slugs, even at once", async () => {
        const browsers = await Promise.all(
          [0, 1, 2].map(async () => loggedIn((await user()).email)),
        );
        const responses = await Promise.all(
          browsers.map((browser) =>
            send(browser, "post", "/me/organizer", { csrf: true }).send({
              displayName: `Festival ${ipCounter}`,
            }),
          ),
        );
        const slugs = responses.map(
          (r) => (r.body as { organizerProfile: { slug: string } }).organizerProfile.slug,
        );
        expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
        expect(new Set(slugs).size).toBe(3);
      });

      it("keeps an ADMIN an ADMIN", async () => {
        const { id, email } = await user({ role: "ADMIN" });
        const browser = await loggedIn(email);
        await send(browser, "post", "/me/organizer", { csrf: true })
          .send({ displayName: "Equipe Vira" })
          .expect(201);
        expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe("ADMIN");
      });

      it("is refused by the database with a slug outside the format", async () => {
        const { id } = await user();
        await expect(
          prisma.organizerProfile.create({
            data: {
              id: uuidv7(),
              userId: id,
              displayName: "X",
              slug: "Com Espaço",
              createdAt: clock.current,
            },
          }),
        ).rejects.toThrow();
      });
    });
  },
);
