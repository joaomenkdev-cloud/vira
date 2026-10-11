import { createHash, randomBytes } from "node:crypto";

import { problemDetailsSchema, type ProblemDetails } from "@vira/shared";
import { Redis } from "ioredis";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { v7 as uuidv7 } from "uuid";

import { PASSWORD_HASHER } from "../../src/modules/auth/application/ports/password-hasher.js";
import { Argon2PasswordHasher } from "../../src/modules/auth/infra/argon2-password-hasher.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri } from "../../src/platform/errors/problem-types.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";
import { MailpitInbox } from "../support/mailpit-inbox.js";

const dockerAvailable = await dockerAvailableOrSkip();

const PASSWORD = "correct horse battery";
const OUTBOX_POLL_MS = "100";

/** A clock the tests move by hand (token expiry, lockout). */
const clock = { current: new Date(), now: () => clock.current };
const advance = (ms: number) => {
  clock.current = new Date(clock.current.getTime() + ms);
};

/** The real hasher, counting how often the API spent time on a password. */
class CountingHasher {
  readonly real = new Argon2PasswordHasher();
  hashes = 0;
  verifies = 0;
  hash(password: string): Promise<string> {
    this.hashes++;
    return this.real.hash(password);
  }
  verify(hash: string | null, password: string): Promise<boolean> {
    this.verifies++;
    return this.real.verify(hash, password);
  }
  get total(): number {
    return this.hashes + this.verifies;
  }
}

function problemOf(response: Response): ProblemDetails {
  return problemDetailsSchema.parse(response.body);
}

/** What an observer can compare between two responses: everything except per-request noise. */
function observable(response: Response) {
  const noise = new Set([
    "date",
    "x-request-id",
    "ratelimit-remaining",
    "ratelimit-reset",
    "connection",
    "keep-alive",
    "etag",
  ]);
  const headers = Object.fromEntries(
    Object.entries(response.headers).filter(([name]) => !noise.has(name)),
  );
  const { requestId: _requestId, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, headers, body };
}

describe.skipIf(!dockerAvailable)(
  "password sign-up and login (PostgreSQL + Redis + Mailpit)",
  () => {
    let infrastructure: Infrastructure;
    let testApp: TestApp;
    let prisma: PrismaService;
    let inbox: MailpitInbox;
    let redis: Redis;
    const hasher = new CountingHasher();

    let ipCounter = 0;
    /** A fresh client address per call, so one test's requests never spend another's budget. */
    const nextIp = () => {
      ipCounter++;
      return `10.${(ipCounter >> 8) & 255}.${ipCounter & 255}.1`;
    };
    let emailCounter = 0;
    const usedEmails = new Set<string>();
    const nextEmail = () => {
      const email = `u${++emailCounter}-${randomBytes(4).toString("hex")}@exemplo.com`;
      usedEmails.add(email);
      return email;
    };

    const api = () => request(testApp.app.getHttpServer());
    const register = (body: { name?: string; email: string; password?: string }, ip = nextIp()) =>
      api()
        .post("/api/v1/auth/register")
        .set("X-Forwarded-For", ip)
        .send({ name: "Ana Souza", password: PASSWORD, ...body });
    const login = (email: string, password: string, ip = nextIp()) =>
      api().post("/api/v1/auth/login").set("X-Forwarded-For", ip).send({ email, password });
    const verify = (token: string, ip = nextIp()) =>
      api().post("/api/v1/auth/email/verify").set("X-Forwarded-For", ip).send({ token });

    /** Registers, waits for the e-mail, and returns the token from its link. */
    async function signUp(email: string): Promise<string> {
      await register({ email }).expect(202);
      const [mail] = await inbox.waitFor(email);
      if (!mail) throw new Error("no verification e-mail");
      return MailpitInbox.tokenIn(mail);
    }

    async function verifiedUser(): Promise<{ email: string; id: string }> {
      const email = nextEmail();
      await verify(await signUp(email)).expect(200);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      return { email, id: user.id };
    }

    async function resetAccountBudget(): Promise<void> {
      const keys = await redis.keys("rl:auth.login.account:*");
      if (keys.length > 0) await redis.del(...keys);
    }

    const auditOf = (entityId: string) =>
      prisma.auditLog.findMany({
        where: { entityId },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      });

    beforeAll(async () => {
      infrastructure = await startInfrastructure({ mail: true });
      if (!infrastructure.mailpit) throw new Error("Mailpit did not start");
      inbox = new MailpitInbox(infrastructure.mailpit);
      redis = new Redis(infrastructure.redisUrl);
      testApp = await createTestApp({
        env: {
          DATABASE_URL: infrastructure.databaseUrl,
          REDIS_URL: infrastructure.redisUrl,
          SMTP_URL: infrastructure.mailpit.smtpUrl,
          // The worker runs inside the API process: sign-up -> outbox -> queue -> SMTP.
          WORKER_MODE: "embedded",
          OUTBOX_POLL_INTERVAL_MS: OUTBOX_POLL_MS,
          TRUST_PROXY_HOPS: "1",
        },
        override: (builder) =>
          builder
            .overrideProvider(CLOCK)
            .useValue(clock)
            .overrideProvider(PASSWORD_HASHER)
            .useValue(hasher),
      });
      prisma = testApp.app.get(PrismaService);
    });

    afterAll(async () => {
      await testApp.app.close();
      redis.disconnect();
      await infrastructure.stop();
    });

    beforeEach(async () => {
      await resetAccountBudget();
    });

    describe("sign-up and e-mail verification", () => {
      it("answers a new and an already registered address with the same 202", async () => {
        const email = nextEmail();

        const first = await register({ email }).expect(202);
        await inbox.waitFor(email);
        const second = await register({ email }).expect(202);

        expect(first.body).toEqual({ status: "accepted" });
        expect(observable(second)).toEqual(observable(first));
      });

      it("answers a duplicate registration the same even when the name and password differ", async () => {
        const email = nextEmail();
        const first = await register({ email }).expect(202);

        const second = await register({
          email,
          name: "Outra Pessoa",
          password: "another long password",
        }).expect(202);

        expect(observable(second)).toEqual(observable(first));
        // The duplicate never changes the existing account.
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(user.name).toBe("Ana Souza");
      });

      it("creates an unverified BUYER with an argon2id hash and mails a verification link", async () => {
        const email = nextEmail();
        const token = await signUp(email);

        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(user).toMatchObject({
          name: "Ana Souza",
          role: "BUYER",
          emailVerifiedAt: null,
          failedLoginCount: 0,
          lockedUntil: null,
        });
        expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

        const [mail] = await inbox.waitFor(email);
        expect(mail?.subject).toBe("Confirme seu e-mail na Vira");
        expect(mail?.text).toContain("Olá, Ana Souza!");
      });

      it("keeps the token out of the database and the outbox: only its SHA-256 is stored", async () => {
        const email = nextEmail();
        const token = await signUp(email);
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });

        const rows = await prisma.verificationToken.findMany({ where: { userId: user.id } });
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ purpose: "EMAIL_VERIFICATION", usedAt: null });
        expect(Buffer.from(rows[0]?.tokenHash ?? [])).toEqual(
          createHash("sha256").update(token).digest(),
        );

        const outbox = await prisma.outboxMessage.findMany({
          where: { payload: { path: ["userId"], equals: user.id } },
        });
        expect(outbox.map((message) => message.type)).toEqual([
          "auth.verification_email_requested",
        ]);
        expect(outbox[0]?.payload).toEqual({ userId: user.id });
        expect(JSON.stringify(outbox)).not.toContain(token);
        expect(JSON.stringify(outbox)).not.toContain(email);
      });

      it("verifies the address with the link's token and answers with the user", async () => {
        const email = nextEmail();
        const token = await signUp(email);

        const response = await verify(token).expect(200);

        expect(response.body).toEqual({
          user: {
            id: expect.any(String) as string,
            name: "Ana Souza",
            email,
            role: "BUYER",
            emailVerified: true,
          },
        });
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(user.emailVerifiedAt).not.toBeNull();
        expect(response.headers["set-cookie"]).toBeUndefined();
      });

      it("tells the owner of a known address that they already have an account, with no link", async () => {
        const email = nextEmail();
        await signUp(email);

        await register({ email }).expect(202);
        const mails = await inbox.waitFor(email, 2);

        expect(mails).toHaveLength(2);
        expect(mails[1]?.subject).toBe("Você já tem uma conta na Vira");
        expect(mails[1]?.text).toContain("/entrar");
        expect(mails[1]?.text).not.toMatch(/#token=/);
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(await prisma.verificationToken.count({ where: { userId: user.id } })).toBe(1);
      });

      it("refuses a token that was already used, with 410", async () => {
        const token = await signUp(nextEmail());
        await verify(token).expect(200);

        const response = await verify(token).expect(410);

        expect(problemOf(response).type).toBe(problemTypeUri("token-expired"));
      });

      it("refuses an expired token with 410, and leaves the address unverified", async () => {
        const email = nextEmail();
        const token = await signUp(email);
        advance(24 * 60 * 60 * 1000 + 1);

        const response = await verify(token).expect(410);

        expect(problemOf(response).type).toBe(problemTypeUri("token-expired"));
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(user.emailVerifiedAt).toBeNull();
      });

      it("answers an unknown token like an expired one", async () => {
        const unknown = randomBytes(32).toString("base64url");

        const response = await verify(unknown).expect(410);

        expect(problemOf(response).type).toBe(problemTypeUri("token-expired"));
      });

      it("lets exactly one of several simultaneous requests use a token", async () => {
        const token = await signUp(nextEmail());

        const responses = await Promise.all(Array.from({ length: 6 }, () => verify(token)));

        expect(responses.map((response) => response.status).sort()).toEqual([
          200, 410, 410, 410, 410, 410,
        ]);
      });

      it("creates one account when the same new address is registered many times at once", async () => {
        const email = nextEmail();

        const responses = await Promise.all(Array.from({ length: 5 }, () => register({ email })));

        expect(responses.map((response) => response.status)).toEqual([202, 202, 202, 202, 202]);
        expect(await prisma.user.count({ where: { email } })).toBe(1);
        // One request created the account; the others found it and sent the notice.
        const mails = await inbox.waitFor(email, 5);
        expect(mails.map((mail) => mail.subject).sort()).toEqual([
          "Confirme seu e-mail na Vira",
          "Você já tem uma conta na Vira",
          "Você já tem uma conta na Vira",
          "Você já tem uma conta na Vira",
          "Você já tem uma conta na Vira",
        ]);
      });

      it("does not accept a role from the client", async () => {
        const email = nextEmail();

        await register({ email, role: "ADMIN" } as never).expect(400);

        expect(await prisma.user.count({ where: { email } })).toBe(0);
      });
    });

    describe("login", () => {
      it("answers 200 with the user and no cookies", async () => {
        const { email, id } = await verifiedUser();

        const response = await login(email, PASSWORD).expect(200);

        expect(response.body).toEqual({
          user: { id, name: "Ana Souza", email, role: "BUYER", emailVerified: true },
        });
        expect(response.headers["set-cookie"]).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toContain("argon2");
      });

      it("accepts the address in any case and with stray spaces", async () => {
        const { email } = await verifiedUser();

        await login(`  ${email.toUpperCase()} `, PASSWORD).expect(200);
      });

      it("answers a wrong password and an unknown address identically", async () => {
        const { email } = await verifiedUser();

        const wrongPassword = await login(email, "not the password").expect(401);
        const unknownAddress = await login(nextEmail(), PASSWORD).expect(401);

        expect(problemOf(wrongPassword).type).toBe(problemTypeUri("invalid-credentials"));
        expect(observable(unknownAddress)).toEqual(observable(wrongPassword));
      });

      it("spends one password verification per attempt, whether the address exists or not", async () => {
        const { email } = await verifiedUser();

        const before = hasher.verifies;
        await login(email, "not the password").expect(401);
        const afterKnown = hasher.verifies;
        await login(nextEmail(), PASSWORD).expect(401);
        const afterUnknown = hasher.verifies;

        expect(afterKnown - before).toBe(1);
        expect(afterUnknown - afterKnown).toBe(1);
      });

      it("tells only someone who knows the password that the address is unverified", async () => {
        const email = nextEmail();
        await signUp(email);

        const right = await login(email, PASSWORD).expect(403);
        const wrong = await login(email, "not the password").expect(401);

        expect(problemOf(right).type).toBe(problemTypeUri("email-not-verified"));
        expect(problemOf(wrong).type).toBe(problemTypeUri("invalid-credentials"));
      });

      it("records who logged in, and every failure, in the audit log", async () => {
        const { email, id } = await verifiedUser();
        await login(email, "not the password").expect(401);
        await login(email, PASSWORD).expect(200);
        await login(nextEmail(), PASSWORD).expect(401);

        const entries = await auditOf(id);
        expect(entries.map((entry) => [entry.action, entry.metadata])).toEqual([
          ["auth.registered", {}],
          ["auth.email_verified", {}],
          ["auth.login_failed", { reason: "invalid_credentials" }],
          ["auth.login_succeeded", { method: "password" }],
        ]);
        expect(entries.find((entry) => entry.action === "auth.login_succeeded")).toMatchObject({
          actorId: id,
          actorRole: "BUYER",
          entityType: "user",
        });
        // An unknown address is recorded without any entity to point at.
        const unknown = await prisma.auditLog.findFirst({
          where: { action: "auth.login_failed", entityId: null },
        });
        expect(unknown?.metadata).toEqual({ reason: "invalid_credentials" });
      });

      it("never writes an address, a name or a password to the audit log", async () => {
        const entries = await prisma.auditLog.findMany({
          where: { action: { startsWith: "auth." } },
        });
        const everything = JSON.stringify(entries);

        expect(entries.length).toBeGreaterThan(0);
        for (const email of usedEmails) expect(everything).not.toContain(email);
        expect(everything).not.toContain("Ana Souza");
        expect(everything).not.toContain(PASSWORD);
      });
    });

    describe("progressive lockout", () => {
      it("locks the account after five failures, refuses even the right password, and unlocks later", async () => {
        const { email, id } = await verifiedUser();

        for (let attempt = 1; attempt <= 5; attempt++) {
          await resetAccountBudget();
          await login(email, "not the password").expect(401);
        }

        const locked = await prisma.user.findUniqueOrThrow({ where: { id } });
        expect(locked.failedLoginCount).toBe(5);
        expect(locked.lockedUntil).toEqual(new Date(clock.current.getTime() + 60_000));

        // Locked: the right password gets the same answer as a wrong one.
        await resetAccountBudget();
        const refused = await login(email, PASSWORD).expect(401);
        expect(problemOf(refused).type).toBe(problemTypeUri("invalid-credentials"));
        expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
          failedLoginCount: 5,
        });

        const reasons = (await auditOf(id))
          .filter((entry) => entry.action === "auth.login_failed")
          .map((entry) => (entry.metadata as { reason: string }).reason);
        expect(reasons).toEqual([
          "invalid_credentials",
          "invalid_credentials",
          "invalid_credentials",
          "invalid_credentials",
          "invalid_credentials",
          "locked",
        ]);
        expect(
          (await auditOf(id)).find((entry) => entry.action === "auth.account_locked"),
        ).toMatchObject({
          metadata: { failedAttempts: 5, lockSeconds: 60 },
          actorId: null,
        });

        // The lock runs out and the right password works again, clearing the record.
        advance(60_000);
        await resetAccountBudget();
        await login(email, PASSWORD).expect(200);
        expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
          failedLoginCount: 0,
          lockedUntil: null,
        });
      });

      it("locks for twice as long when a failure follows an expired lock", async () => {
        const { email, id } = await verifiedUser();
        for (let attempt = 1; attempt <= 5; attempt++) {
          await resetAccountBudget();
          await login(email, "not the password").expect(401);
        }
        advance(60_000);

        await resetAccountBudget();
        await login(email, "not the password").expect(401);

        const user = await prisma.user.findUniqueOrThrow({ where: { id } });
        expect(user.failedLoginCount).toBe(6);
        expect(user.lockedUntil).toEqual(new Date(clock.current.getTime() + 120_000));
        advance(120_000);
      });

      it("does not let attempts during the lock extend it", async () => {
        const { email, id } = await verifiedUser();
        for (let attempt = 1; attempt <= 5; attempt++) {
          await resetAccountBudget();
          await login(email, "not the password").expect(401);
        }
        const { lockedUntil } = await prisma.user.findUniqueOrThrow({ where: { id } });

        await resetAccountBudget();
        await login(email, "not the password").expect(401);

        expect(await prisma.user.findUniqueOrThrow({ where: { id } })).toMatchObject({
          failedLoginCount: 5,
          lockedUntil,
        });
        advance(60_000);
      });
    });

    describe("rate limits", () => {
      it("refuses the sixth sign-up from one address within the hour, before hashing", async () => {
        const ip = nextIp();
        for (let i = 0; i < 5; i++) await register({ email: nextEmail() }, ip).expect(202);

        const before = hasher.total;
        const response = await register({ email: nextEmail() }, ip).expect(429);

        expect(problemOf(response).type).toBe(problemTypeUri("rate-limited"));
        expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
        expect(Number(response.headers["retry-after"])).toBeLessThanOrEqual(3600);
        expect(response.headers).toMatchObject({
          "ratelimit-limit": "5",
          "ratelimit-remaining": "0",
        });
        expect(hasher.total).toBe(before);
        // Another address has its own budget.
        await register({ email: nextEmail() }).expect(202);
      });

      it("keeps the window finite: the counter expires with the hour", async () => {
        const ip = nextIp();
        await register({ email: nextEmail() }, ip).expect(202);

        const key = `rl:auth.register.ip:${createHash("sha256").update(ip).digest("hex")}`;
        const ttl = await redis.ttl(key);

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(3600);
      });

      it("refuses the eleventh login from one address within 15 minutes, before hashing", async () => {
        const ip = nextIp();
        // Different addresses each time, so only the per-IP budget is being spent.
        for (let i = 0; i < 10; i++) await login(nextEmail(), PASSWORD, ip).expect(401);

        const before = hasher.total;
        const response = await login(nextEmail(), PASSWORD, ip).expect(429);

        expect(problemOf(response).type).toBe(problemTypeUri("rate-limited"));
        expect(response.headers).toMatchObject({ "ratelimit-limit": "10" });
        expect(Number(response.headers["retry-after"])).toBeLessThanOrEqual(900);
        expect(hasher.total).toBe(before);
      });

      it("refuses the sixth login attempt on one account within 15 minutes, before hashing", async () => {
        const { email } = await verifiedUser();
        for (let i = 0; i < 5; i++) await login(email, "not the password").expect(401);

        const before = hasher.total;
        const response = await login(email, PASSWORD).expect(429);

        expect(problemOf(response).type).toBe(problemTypeUri("rate-limited"));
        expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
        expect(hasher.total).toBe(before);
      });

      it("limits an unknown address exactly as it limits a real one", async () => {
        const real = await verifiedUser();
        const unknown = nextEmail();
        const outcomes = async (email: string) => {
          const statuses: number[] = [];
          for (let i = 0; i < 6; i++)
            statuses.push((await login(email, "not the password")).status);
          return statuses;
        };

        expect(await outcomes(real.email)).toEqual([401, 401, 401, 401, 401, 429]);
        expect(await outcomes(unknown)).toEqual([401, 401, 401, 401, 401, 429]);
      });

      it("refuses the eleventh verification from one address within the hour", async () => {
        const ip = nextIp();
        for (let i = 0; i < 10; i++) {
          await verify(randomBytes(32).toString("base64url"), ip).expect(410);
        }

        const response = await verify(randomBytes(32).toString("base64url"), ip).expect(429);

        expect(problemOf(response).type).toBe(problemTypeUri("rate-limited"));
        expect(response.headers).toMatchObject({ "ratelimit-limit": "10" });
      });
    });

    describe("constraints in the database", () => {
      const insertUser = (email: string, name = "Ana", passwordHash: string | null = null) =>
        prisma.$executeRaw`
        INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
        VALUES (${uuidv7()}::uuid, ${email}, ${name}, ${passwordHash}, now(), now())`;

      it("rejects an address that is not normalized, too long, or malformed", async () => {
        await expect(insertUser("Ana@Exemplo.com")).rejects.toThrow(/users_email_normalized/);
        // Spaces are refused by the format check, which Postgres evaluates first.
        await expect(insertUser(" ana@exemplo.com")).rejects.toThrow(/users_email_format/);
        await expect(insertUser(`${"a".repeat(250)}@exemplo.com`)).rejects.toThrow(
          /users_email_length/,
        );
        await expect(insertUser("sem-arroba")).rejects.toThrow(/users_email_format/);
      });

      it("rejects an empty, padded or oversized name", async () => {
        await expect(insertUser(nextEmail(), "")).rejects.toThrow(/users_name_length/);
        await expect(insertUser(nextEmail(), "a".repeat(121))).rejects.toThrow(/users_name_length/);
        await expect(insertUser(nextEmail(), " Ana")).rejects.toThrow(/users_name_trimmed/);
      });

      it("accepts only argon2id password hashes", async () => {
        await expect(insertUser(nextEmail(), "Ana", "$2b$10$abcdefghijklmnop")).rejects.toThrow(
          /users_password_hash_argon2id/,
        );
        await expect(insertUser(nextEmail(), "Ana", "plain text")).rejects.toThrow(
          /users_password_hash_argon2id/,
        );
      });

      it("keeps one account per address, whatever the case it was looked up with", async () => {
        const email = nextEmail();
        await insertUser(email);

        await expect(insertUser(email)).rejects.toThrow(/users_email_key/);
        const found = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM users WHERE email = ${email.toUpperCase()}::citext`;
        expect(found[0]?.count).toBe(1n);
      });

      it("stores token hashes of exactly 32 bytes, once each", async () => {
        const { id } = await verifiedUser();
        const insertToken = (hash: Buffer) =>
          prisma.$executeRaw`
          INSERT INTO verification_tokens (id, user_id, purpose, token_hash, expires_at, created_at)
          VALUES (${uuidv7()}::uuid, ${id}::uuid, 'PASSWORD_RESET', ${hash}, now() + interval '1 hour', now())`;
        const hash = randomBytes(32);

        await insertToken(hash);

        await expect(insertToken(hash)).rejects.toThrow(/verification_tokens_token_hash_key/);
        await expect(insertToken(randomBytes(16))).rejects.toThrow(
          /verification_tokens_hash_is_sha256/,
        );
      });
    });
  },
);
