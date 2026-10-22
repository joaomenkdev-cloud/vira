import { createHash, randomBytes } from "node:crypto";

import { dataExportSchema, problemDetailsSchema } from "@vira/shared";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Argon2PasswordHasher } from "../../src/modules/auth/infra/argon2-password-hasher.js";
import { ApplyRetention } from "../../src/modules/privacy/application/apply-retention.js";
import { PrismaPrivacyRepository } from "../../src/modules/privacy/infra/prisma-privacy-repository.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri, type ProblemType } from "../../src/platform/errors/problem-types.js";
import { RATE_LIMITER } from "../../src/platform/rate-limit/rate-limiter.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { AccessTokens } from "../../src/platform/security/access-token.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import { InMemoryRateLimiter } from "../support/in-memory-rate-limiter.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const PASSWORD = "correct horse battery";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const clock = { current: new Date("2026-12-01T12:00:00Z"), now: () => clock.current };
const ago = (ms: number) => new Date(clock.current.getTime() - ms);
const ahead = (ms: number) => new Date(clock.current.getTime() + ms);
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomCode(prefix: string): string {
  const symbols = Array.from(randomBytes(8), (byte) => CROCKFORD[byte % 32]).join("");
  return `${prefix}-${symbols.slice(0, 4)}-${symbols.slice(4)}`;
}

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

describe.skipIf(!dockerAvailable)("privacy (PostgreSQL)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  let passwordHash: string;
  const limiter = new InMemoryRateLimiter();
  const api = () => request(testApp.app.getHttpServer());

  /**
   * A person with an account, a logged-in session and every kind of personal data the
   * inventory lists. `marker` makes their name and e-mail unique to this test, so a search
   * of the whole database for them finds nothing else.
   */
  async function person(options: { password?: boolean; loggedInAgo?: number } = {}) {
    const id = uuidv7();
    const marker = randomBytes(6).toString("hex");
    const name = `Ana ${marker}`;
    const email = `ana.${marker}@exemplo.com`;
    await prisma.user.create({
      data: {
        id,
        email,
        name,
        passwordHash: options.password === false ? null : passwordHash,
        emailVerifiedAt: ago(30 * DAY),
        createdAt: ago(30 * DAY),
      },
    });
    const sessionId = uuidv7();
    const loggedInAt = ago(options.loggedInAgo ?? 0);
    await prisma.session.create({
      data: {
        id: uuidv7(),
        userId: id,
        familyId: sessionId,
        tokenHash: new Uint8Array(randomBytes(32)),
        authenticatedAt: loggedInAt,
        createdAt: loggedInAt,
        absoluteExpiresAt: ahead(20 * DAY),
        expiresAt: ahead(7 * DAY),
      },
    });
    const auth = () =>
      `Bearer ${testApp.app.get(AccessTokens).issue({ sub: id, role: "BUYER", sid: sessionId }).token}`;
    return {
      id,
      name,
      email,
      marker,
      exportData: () => api().get("/api/v1/me/export").set("Authorization", auth()),
      remove: (body: Record<string, unknown>) =>
        api().delete("/api/v1/me").set("Authorization", auth()).send(body),
    };
  }

  async function organizerProfile(userId: string, displayName: string) {
    const id = uuidv7();
    await prisma.organizerProfile.create({
      data: { id, userId, displayName, slug: `org-${id.slice(-12)}`, createdAt: ago(20 * DAY) },
    });
    return id;
  }

  async function event(
    organizerId: string,
    when: { startsAt: Date; endsAt: Date },
    status: "DRAFT" | "PUBLISHED" = "PUBLISHED",
  ) {
    const id = uuidv7();
    await prisma.event.create({
      data: {
        id,
        organizerId,
        slug: `evento-${id.slice(-12)}`,
        title: "Noite de forró",
        status,
        ...when,
        timezone: "America/Sao_Paulo",
        venueName: "Circo Voador",
        venueAddress: "Rua dos Arcos, s/n",
        venueCity: "Rio de Janeiro",
        venueState: "RJ",
        imageKey: `events/${id}/capa.webp`,
        imageAlt: "Pista cheia",
        imageWidth: 2400,
        imageHeight: 1350,
        imageBlurDataUrl: "data:image/webp;base64,AA==",
        publishedAt: status === "PUBLISHED" ? ago(60 * DAY) : null,
        createdAt: ago(200 * DAY),
      },
    });
    const ticketTypeId = uuidv7();
    await prisma.ticketType.create({
      data: {
        id: ticketTypeId,
        eventId: id,
        name: "Pista",
        priceCents: 8000,
        capacity: 100,
        maxPerOrder: 10,
        sortOrder: 0,
        createdAt: ago(200 * DAY),
      },
    });
    return { id, ticketTypeId };
  }

  /** A paid order of `buyer` for `holders`, with their tickets (statuses in the same order). */
  async function paidOrder(
    buyer: { id: string; name: string; email: string },
    at: { id: string; ticketTypeId: string },
    holders: { name: string; status?: "VALID" | "USED" }[],
    createdAt = ago(10 * DAY),
  ) {
    const orderId = uuidv7();
    const orderItemId = uuidv7();
    await prisma.order.create({
      data: {
        id: orderId,
        publicCode: randomCode("VIRA-ORD"),
        buyerId: buyer.id,
        eventId: at.id,
        status: "PAID",
        totalCents: 8000 * holders.length,
        expiresAt: new Date(createdAt.getTime() + 10 * MINUTE),
        idempotencyKey: uuidv7(),
        requestHash: new Uint8Array(32),
        stripePaymentIntentId: `pi_${orderId.replaceAll("-", "")}`,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        createdAt,
        paidAt: createdAt,
        items: {
          create: {
            id: orderItemId,
            ticketTypeId: at.ticketTypeId,
            quantity: holders.length,
            unitPriceCents: 8000,
            holderNames: holders.map((holder) => holder.name),
          },
        },
      },
    });
    const ticketIds: string[] = [];
    for (const holder of holders) {
      const id = uuidv7();
      const used = holder.status === "USED";
      await prisma.ticket.create({
        data: {
          id,
          code: randomCode("VIRA"),
          holderName: holder.name,
          qrNonce: new Uint8Array(randomBytes(16)),
          orderId,
          orderItemId,
          eventId: at.id,
          ticketTypeId: at.ticketTypeId,
          issuedAt: createdAt,
          ...(used ? { status: "USED" as const, usedAt: createdAt } : {}),
        },
      });
      ticketIds.push(id);
    }
    return { orderId, ticketIds };
  }

  /** Every row of every table of the schema, as text, that mentions `needle`. */
  async function rowsMentioning(needle: string): Promise<string[]> {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`;
    const found: string[] = [];
    for (const { table_name: table } of tables) {
      const rows = await prisma.$queryRawUnsafe<{ row: string }[]>(
        `SELECT t::text AS row FROM "${table}" AS t WHERE t::text ILIKE $1`,
        `%${needle}%`,
      );
      found.push(...rows.map((row) => `${table}: ${row.row}`));
    }
    return found;
  }

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: { DATABASE_URL: infrastructure.databaseUrl, REDIS_URL: infrastructure.redisUrl },
      override: (builder) =>
        builder
          .overrideProvider(CLOCK)
          .useValue(clock)
          .overrideProvider(RATE_LIMITER)
          .useValue(limiter),
    });
    prisma = testApp.app.get(PrismaService);
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("exports everything the account holds, as a documented file, three times a day", async () => {
    const ana = await person();
    await prisma.oAuthAccount.create({
      data: {
        id: uuidv7(),
        userId: ana.id,
        provider: "GITHUB",
        providerAccountId: "4242",
        createdAt: ago(5 * DAY),
      },
    });
    const host = await person();
    const show = await event(await organizerProfile(host.id, "Coletivo"), {
      startsAt: ahead(10 * DAY),
      endsAt: ahead(10 * DAY + 5 * 60 * MINUTE),
    });
    await paidOrder(ana, show, [{ name: ana.name }, { name: "Bia Reis" }]);

    const response = await ana.exportData().expect(200);
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="vira-meus-dados-2026-12-01.json"',
    );
    expect(response.headers["cache-control"]).toBe("no-store");
    const file = dataExportSchema.parse(response.body);
    expect(file.account).toMatchObject({ id: ana.id, name: ana.name, email: ana.email });
    expect(file.socialLogins).toEqual([
      { provider: "github", providerAccountId: "4242", linkedAt: ago(5 * DAY).toISOString() },
    ]);
    expect(file.sessions).toHaveLength(1);
    expect(file.organizerProfile).toBeNull();
    expect(file.orders).toHaveLength(1);
    expect(file.orders[0]?.items[0]?.holderNames).toEqual([ana.name, "Bia Reis"]);
    expect(file.tickets.map((ticket) => ticket.holderName).sort()).toEqual(
      [ana.name, "Bia Reis"].sort(),
    );
    // Nothing of the session secrets or the password: hashes are not the person's data.
    expect(JSON.stringify(file)).not.toContain("argon2");

    const audit = await prisma.auditLog.findMany({
      where: { actorId: ana.id, action: "user.data_exported" },
    });
    expect(audit).toHaveLength(1);

    await ana.exportData().expect(200);
    await ana.exportData().expect(200);
    const fourth = await ana.exportData().expect(429);
    expectProblem(fourth, "rate-limited");
  });

  it("erases every copy of the name and e-mail, keeping the money records", async () => {
    const ana = await person();
    // Personal data in every table of the inventory.
    await prisma.oAuthAccount.create({
      data: {
        id: uuidv7(),
        userId: ana.id,
        provider: "GOOGLE",
        providerAccountId: `google-${ana.marker}`,
        createdAt: ago(5 * DAY),
      },
    });
    await prisma.user.update({
      where: { id: ana.id },
      data: { pendingEmail: `nova.${ana.marker}@exemplo.com` },
    });
    await prisma.verificationToken.create({
      data: {
        id: uuidv7(),
        userId: ana.id,
        purpose: "EMAIL_CHANGE",
        tokenHash: new Uint8Array(createHash("sha256").update(ana.marker).digest()),
        expiresAt: ahead(DAY),
        createdAt: clock.current,
        newEmail: `nova.${ana.marker}@exemplo.com`,
      },
    });
    // Organizer of past and draft events only: free to leave.
    const anaProfile = await organizerProfile(ana.id, `Produções ${ana.marker}`);
    await event(anaProfile, { startsAt: ago(40 * DAY), endsAt: ago(39 * DAY) });
    await event(anaProfile, { startsAt: ahead(40 * DAY), endsAt: ahead(41 * DAY) }, "DRAFT");

    const host = await person();
    const hostProfile = await organizerProfile(host.id, "Coletivo");
    const upcoming = await event(hostProfile, {
      startsAt: ahead(10 * DAY),
      endsAt: ahead(11 * DAY),
    });
    const past = await event(hostProfile, { startsAt: ago(20 * DAY), endsAt: ago(19 * DAY) });
    const later = await event(hostProfile, { startsAt: ahead(30 * DAY), endsAt: ahead(31 * DAY) });
    const future = await paidOrder(ana, upcoming, [
      { name: ana.name },
      { name: `Terceira ${ana.marker}` },
    ]);
    const history = await paidOrder(ana, past, [{ name: ana.name, status: "USED" }], ago(25 * DAY));
    const pendingId = uuidv7();
    await prisma.order.create({
      data: {
        id: pendingId,
        publicCode: randomCode("VIRA-ORD"),
        buyerId: ana.id,
        eventId: later.id,
        totalCents: 8000,
        expiresAt: ahead(8 * MINUTE),
        idempotencyKey: uuidv7(),
        requestHash: new Uint8Array(32),
        buyerName: ana.name,
        buyerEmail: ana.email,
        createdAt: ago(2 * MINUTE),
        items: {
          create: {
            id: uuidv7(),
            ticketTypeId: later.ticketTypeId,
            quantity: 1,
            unitPriceCents: 8000,
            holderNames: [ana.name],
          },
        },
      },
    });

    expect(await rowsMentioning(ana.marker)).not.toEqual([]);
    const response = await ana.remove({ confirm: "EXCLUIR", password: PASSWORD }).expect(202);
    expect(response.body).toEqual({ status: "accepted" });
    const cleared = (response.headers["set-cookie"] ?? []) as unknown as string[];
    expect(cleared.some((cookie) => cookie.startsWith("__Host-vira_at=;"))).toBe(true);

    // The proof: nowhere in the database is the name, the e-mail or the third party's name.
    expect(await rowsMentioning(ana.marker)).toEqual([]);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: ana.id } });
    expect(user).toMatchObject({
      email: `deleted+${ana.id}@invalid`,
      name: "Conta excluída",
      passwordHash: null,
      pendingEmail: null,
      anonymizedAt: clock.current,
    });
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(0);
    expect(await prisma.oAuthAccount.count({ where: { userId: ana.id } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { userId: ana.id } })).toBe(0);
    expect(
      await prisma.organizerProfile.findUniqueOrThrow({ where: { id: anaProfile } }),
    ).toMatchObject({ displayName: "Organizador removido" });
    // The account page answers as if there were no session.
    expectProblem(
      await api()
        .get("/api/v1/me")
        .set(
          "Authorization",
          `Bearer ${testApp.app.get(AccessTokens).issue({ sub: ana.id, role: "BUYER", sid: uuidv7() }).token}`,
        )
        .expect(401),
      "unauthenticated",
    );

    // Receipts stay, pointing at no one.
    const order = await prisma.order.findUniqueOrThrow({ where: { id: future.orderId } });
    expect(order).toMatchObject({
      status: "PAID",
      totalCents: 16000,
      stripePaymentIntentId: `pi_${future.orderId.replaceAll("-", "")}`,
      buyerName: "Conta excluída",
      buyerEmail: `deleted+${ana.id}@invalid`,
    });
    // Tickets still to be used are canceled; the one already used stays as history.
    const tickets = await prisma.ticket.findMany({
      where: { orderId: { in: [future.orderId, history.orderId] } },
      orderBy: { id: "asc" },
    });
    expect(tickets.map((ticket) => [ticket.status, ticket.holderName])).toEqual([
      ["CANCELED", "Titular removido"],
      ["CANCELED", "Titular removido"],
      ["USED", "Titular removido"],
    ]);
    // The order still being paid lets go of its tickets now.
    const pending = await prisma.order.findUniqueOrThrow({ where: { id: pendingId } });
    expect(pending.expiresAt.getTime()).toBeLessThanOrEqual(clock.current.getTime());

    const audit = await prisma.auditLog.findMany({
      where: { actorId: ana.id, action: "user.anonymized" },
    });
    expect(audit).toHaveLength(1);

    // The access token still in someone's hands opens nothing of the account any more.
    expectProblem(await ana.exportData().expect(401), "unauthenticated");
    expectProblem(
      await ana.remove({ confirm: "EXCLUIR", password: PASSWORD }).expect(401),
      "unauthenticated",
    );
  });

  it("asks again who is at the keyboard", async () => {
    const ana = await person();
    expectProblem(await ana.remove({ confirm: "EXCLUIR" }).expect(400), "validation-failed");
    const wrong = await ana
      .remove({ confirm: "EXCLUIR", password: "not the password" })
      .expect(400);
    expectProblem(wrong, "incorrect-password");
    expect(problemDetailsSchema.parse(wrong.body).errors).toEqual([
      { path: "password", message: "Senha atual incorreta." },
    ]);
    expectProblem(
      await ana.remove({ confirm: "excluir", password: PASSWORD }).expect(400),
      "validation-failed",
    );
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).toMatchObject({
      name: ana.name,
      anonymizedAt: null,
    });

    // Social login only: no password to type, so the login must be recent.
    const stale = await person({ password: false, loggedInAgo: 10 * MINUTE });
    expectProblem(
      await stale.remove({ confirm: "EXCLUIR" }).expect(401),
      "reauthentication-required",
    );
    const fresh = await person({ password: false, loggedInAgo: 2 * MINUTE });
    await fresh.remove({ confirm: "EXCLUIR" }).expect(202);
    expect(await rowsMentioning(fresh.marker)).toEqual([]);
  });

  it("keeps an organizer with events to come until they are canceled", async () => {
    const ana = await person();
    const profile = await organizerProfile(ana.id, `Produções ${ana.marker}`);
    await event(profile, { startsAt: ahead(10 * DAY), endsAt: ahead(11 * DAY) });

    const response = await ana.remove({ confirm: "EXCLUIR", password: PASSWORD }).expect(409);
    expectProblem(response, "organizer-has-upcoming-events");
    // Nothing changed: the refusal rolled the whole erasure back.
    expect(await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).toMatchObject({
      name: ana.name,
      email: ana.email,
      anonymizedAt: null,
    });
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(1);
  });

  it("applies the retention rules, and a second round changes nothing", async () => {
    const ana = await person();
    const host = await person();
    const profile = await organizerProfile(host.id, "Coletivo");
    const old = await event(profile, { startsAt: ago(100 * DAY), endsAt: ago(99 * DAY) });
    const recent = await event(profile, { startsAt: ago(30 * DAY), endsAt: ago(29 * DAY) });
    const oldOrder = await paidOrder(ana, old, [{ name: `Velha ${ana.marker}`, status: "USED" }]);
    const recentOrder = await paidOrder(ana, recent, [{ name: `Recente ${ana.marker}` }]);
    for (const [eventId, ticketId] of [
      [old.id, oldOrder.ticketIds[0]],
      [recent.id, recentOrder.ticketIds[0]],
    ] as const) {
      await prisma.checkinAttempt.create({
        data: {
          id: uuidv7(),
          eventId,
          ticketId: ticketId ?? null,
          operatorId: host.id,
          result: "VALID",
          method: "QR",
          createdAt: ago(99 * DAY),
        },
      });
    }
    const ancient = await paidOrder(
      ana,
      old,
      [{ name: "Ana", status: "USED" }],
      new Date(clock.current.getTime() - 6 * 365 * DAY),
    );
    await prisma.session.create({
      data: {
        id: uuidv7(),
        userId: ana.id,
        familyId: uuidv7(),
        tokenHash: new Uint8Array(randomBytes(32)),
        authenticatedAt: ago(80 * DAY),
        createdAt: ago(80 * DAY),
        absoluteExpiresAt: ago(50 * DAY),
        expiresAt: ago(50 * DAY),
      },
    });
    await prisma.user.update({
      where: { id: ana.id },
      data: { pendingEmail: `nova.${ana.marker}@exemplo.com` },
    });
    await prisma.verificationToken.create({
      data: {
        id: uuidv7(),
        userId: ana.id,
        purpose: "EMAIL_CHANGE",
        tokenHash: new Uint8Array(randomBytes(32)),
        expiresAt: ago(DAY),
        createdAt: ago(2 * DAY),
        newEmail: `nova.${ana.marker}@exemplo.com`,
      },
    });
    const webhookId = `evt_${ana.marker}`;
    await prisma.processedWebhookEvent.create({
      data: { id: webhookId, type: "payment_intent.succeeded", processedAt: ago(91 * DAY) },
    });

    const retention = new ApplyRetention(new PrismaPrivacyRepository(prisma), clock);
    const summary = await retention.execute();
    expect(summary.holdersAnonymized).toBeGreaterThanOrEqual(2);

    const ticket = (id: string | undefined) =>
      prisma.ticket.findUniqueOrThrow({ where: { id: id ?? "" } });
    expect((await ticket(oldOrder.ticketIds[0])).holderName).toBe("Titular removido");
    expect((await ticket(recentOrder.ticketIds[0])).holderName).toBe(`Recente ${ana.marker}`);
    const oldItem = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: oldOrder.orderId },
    });
    expect(oldItem.holderNames).toEqual(["Titular removido"]);
    expect(await prisma.checkinAttempt.count({ where: { eventId: old.id } })).toBe(0);
    expect(await prisma.checkinAttempt.count({ where: { eventId: recent.id } })).toBe(1);
    expect(
      await prisma.session.count({ where: { userId: ana.id, expiresAt: { lt: clock.current } } }),
    ).toBe(0);
    expect(await prisma.session.count({ where: { userId: ana.id } })).toBe(1);
    expect(await prisma.verificationToken.count({ where: { userId: ana.id } })).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ana.id } })).pendingEmail,
    ).toBeNull();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: ancient.orderId } })).toMatchObject({
      buyerName: "Comprador removido",
      buyerEmail: `removed+${ancient.orderId}@invalid`,
    });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: recentOrder.orderId } })).buyerEmail,
    ).toBe(ana.email);
    expect(await prisma.processedWebhookEvent.count({ where: { id: webhookId } })).toBe(0);

    const again = await retention.execute();
    expect(again).toEqual({
      holdersAnonymized: 0,
      checkinAttemptsPurged: 0,
      sessionsPurged: 0,
      tokensPurged: 0,
      ordersAnonymized: 0,
      webhookEventsPurged: 0,
    });
  });
});
