import { randomBytes } from "node:crypto";

import { checkinResponseSchema, checkinStatsSchema, problemDetailsSchema } from "@vira/shared";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { QrTokens } from "../../src/modules/tickets/application/public-api.js";
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

/** The night of the event: the door opens after the tickets were paid. */
const clock = { current: new Date("2026-12-05T23:00:00Z"), now: () => clock.current };
const PAID_AT = new Date("2026-11-01T12:00:00Z");
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomCode(prefix: string): string {
  const symbols = Array.from(randomBytes(8), (byte) => CROCKFORD[byte % 32]).join("");
  return `${prefix}-${symbols.slice(0, 4)}-${symbols.slice(4)}`;
}

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

describe.skipIf(!dockerAvailable)("check-in (PostgreSQL)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  const limiter = new InMemoryRateLimiter();
  const api = () => request(testApp.app.getHttpServer());

  async function user(role: "BUYER" | "ORGANIZER") {
    const id = uuidv7();
    await prisma.user.create({
      data: {
        id,
        email: `${role.toLowerCase()}-${id}@exemplo.com`,
        name: role === "BUYER" ? "Compradora" : "Organizadora",
        role,
        emailVerifiedAt: PAID_AT,
        createdAt: PAID_AT,
      },
    });
    const auth = () =>
      `Bearer ${testApp.app.get(AccessTokens).issue({ sub: id, role, sid: uuidv7() }).token}`;
    return {
      id,
      scan: (eventId: string, token: string) =>
        api().post("/api/v1/checkin/scan").set("Authorization", auth()).send({ eventId, token }),
      code: (eventId: string, code: string) =>
        api().post("/api/v1/checkin/code").set("Authorization", auth()).send({ eventId, code }),
      stats: (eventId: string) =>
        api().get(`/api/v1/organizer/events/${eventId}/checkin/stats`).set("Authorization", auth()),
    };
  }

  /** An organizer, one published event of theirs and a paid order with `holders` tickets. */
  async function eventWithTickets(
    holders: readonly string[],
    organizer?: Awaited<ReturnType<typeof user>>,
  ) {
    const door = organizer ?? (await user("ORGANIZER"));
    let organizerId = (
      await prisma.organizerProfile.findUnique({ where: { userId: door.id }, select: { id: true } })
    )?.id;
    if (!organizerId) {
      organizerId = uuidv7();
      await prisma.organizerProfile.create({
        data: {
          id: organizerId,
          userId: door.id,
          displayName: "Coletivo",
          slug: `coletivo-${organizerId.slice(-12)}`,
          createdAt: PAID_AT,
        },
      });
    }
    const eventId = uuidv7();
    await prisma.event.create({
      data: {
        id: eventId,
        organizerId,
        slug: `forro-${eventId.slice(-12)}`,
        title: "Noite de forró",
        status: "PUBLISHED",
        startsAt: new Date("2026-12-05T22:00:00Z"),
        endsAt: new Date("2026-12-06T03:00:00Z"),
        timezone: "America/Sao_Paulo",
        venueName: "Circo Voador",
        venueAddress: "Rua dos Arcos, s/n",
        venueCity: "Rio de Janeiro",
        venueState: "RJ",
        imageKey: `events/${eventId}/capa.webp`,
        imageAlt: "Pista cheia",
        imageWidth: 2400,
        imageHeight: 1350,
        imageBlurDataUrl: "data:image/webp;base64,AA==",
        publishedAt: PAID_AT,
        createdAt: PAID_AT,
      },
    });
    const ticketTypeId = uuidv7();
    await prisma.ticketType.create({
      data: {
        id: ticketTypeId,
        eventId,
        name: "Pista",
        priceCents: 8000,
        capacity: 100,
        sold: holders.length,
        maxPerOrder: 10,
        sortOrder: 0,
        createdAt: PAID_AT,
      },
    });
    const buyer = await user("BUYER");
    const orderId = uuidv7();
    const orderItemId = uuidv7();
    await prisma.order.create({
      data: {
        id: orderId,
        publicCode: randomCode("VIRA-ORD"),
        buyerId: buyer.id,
        eventId,
        status: "PAID",
        totalCents: 8000 * holders.length,
        expiresAt: new Date(PAID_AT.getTime() + 600_000),
        idempotencyKey: uuidv7(),
        requestHash: new Uint8Array(32),
        buyerName: "Compradora",
        buyerEmail: `compradora-${orderId}@exemplo.com`,
        createdAt: PAID_AT,
        paidAt: PAID_AT,
        items: {
          create: {
            id: orderItemId,
            ticketTypeId,
            quantity: holders.length,
            unitPriceCents: 8000,
            holderNames: [...holders],
          },
        },
      },
    });
    const tickets = [];
    for (const holderName of holders) {
      const ticket = {
        id: uuidv7(),
        code: randomCode("VIRA"),
        holderName,
        qrNonce: randomBytes(16),
      };
      await prisma.ticket.create({
        data: {
          ...ticket,
          qrNonce: new Uint8Array(ticket.qrNonce),
          orderId,
          orderItemId,
          eventId,
          ticketTypeId,
          issuedAt: PAID_AT,
        },
      });
      tickets.push({ ...ticket, token: testApp.app.get(QrTokens).tokenFor(ticket) });
    }
    return { eventId, door, tickets };
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
    // Listening once: concurrent requests would otherwise each start the server.
    await testApp.app.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("lets a ticket in once, records every read and audits the entry", async () => {
    const organizer = await user("ORGANIZER");
    const {
      eventId,
      tickets: [ana],
    } = await eventWithTickets(["Ana Souza"], organizer);
    if (!ana) throw new Error("no ticket");

    const first = await organizer.scan(eventId, ana.token).expect(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    // Only what the door needs: no e-mail, no order, nothing of the buyer.
    expect(checkinResponseSchema.parse(first.body)).toEqual({
      result: "VALID",
      ticket: { code: ana.code, holderName: "Ana Souza", ticketType: "Pista" },
    });
    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ana.id } });
    expect(row).toMatchObject({ status: "USED", usedAt: clock.current, checkedInBy: organizer.id });

    const again = await organizer.scan(eventId, ana.token).expect(200);
    expect(again.body).toEqual({
      result: "ALREADY_USED",
      ticket: { code: ana.code, holderName: "Ana Souza", ticketType: "Pista" },
      usedAt: clock.current.toISOString(),
    });

    const attempts = await prisma.checkinAttempt.findMany({
      where: { eventId },
      orderBy: { id: "asc" },
    });
    expect(attempts.map((a) => [a.result, a.method, a.ticketId, a.operatorId])).toEqual([
      ["VALID", "QR", ana.id, organizer.id],
      ["ALREADY_USED", "QR", ana.id, organizer.id],
    ]);
    const audit = await prisma.auditLog.findMany({ where: { entityId: ana.id } });
    expect(audit).toMatchObject([
      {
        action: "ticket.checked_in",
        actorId: organizer.id,
        entityType: "ticket",
        metadata: { eventId, method: "qr" },
      },
    ]);
  });

  it("lets only one of two simultaneous reads of the same QR in", async () => {
    const { eventId, door, tickets } = await eventWithTickets(["Ana Souza"]);
    const [ana] = tickets;
    if (!ana) throw new Error("no ticket");

    const responses = await Promise.all(
      Array.from({ length: 2 }, () => door.scan(eventId, ana.token).expect(200)),
    );
    const results = responses.map((response) => checkinResponseSchema.parse(response.body).result);
    expect(results.sort()).toEqual(["ALREADY_USED", "VALID"]);
    expect(await prisma.auditLog.count({ where: { entityId: ana.id } })).toBe(1);

    // And under a heavier crowd at the door, still a single entry.
    const { eventId: other, door: busy, tickets: crowd } = await eventWithTickets(["Caio Lima"]);
    const [caio] = crowd;
    if (!caio) throw new Error("no ticket");
    const many = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        i % 2 === 0 ? busy.scan(other, caio.token) : busy.code(other, caio.code),
      ),
    );
    const crowdResults = many.map((response) => checkinResponseSchema.parse(response.body).result);
    expect(crowdResults.filter((result) => result === "VALID")).toHaveLength(1);
    expect(crowdResults.filter((result) => result === "ALREADY_USED")).toHaveLength(7);
  });

  it("refuses a token altered in one byte, an old QR after a reissue and garbage", async () => {
    const { eventId, door, tickets } = await eventWithTickets(["Ana Souza", "Caio Lima"]);
    const [ana, caio] = tickets;
    if (!ana || !caio) throw new Error("no ticket");

    // One byte of the payload changed: the signature no longer matches.
    const [version, kid, payload, signature] = ana.token.split(".") as [
      string,
      string,
      string,
      string,
    ];
    const bytes = Buffer.from(payload, "base64url");
    bytes[20] = (bytes[20] ?? 0) ^ 1;
    const altered = [version, kid, bytes.toString("base64url"), signature].join(".");
    expect((await door.scan(eventId, altered).expect(200)).body).toEqual({ result: "INVALID" });

    // A new nonce voids the QR printed before it (ADR-0008).
    await prisma.ticket.update({
      where: { id: caio.id },
      data: { qrNonce: new Uint8Array(randomBytes(16)) },
    });
    expect((await door.scan(eventId, caio.token).expect(200)).body).toEqual({ result: "INVALID" });
    expect((await door.scan(eventId, "não é um QR do Vira").expect(200)).body).toEqual({
      result: "INVALID",
    });

    const states = await prisma.ticket.findMany({ where: { eventId }, select: { status: true } });
    expect(states.every((ticket) => ticket.status === "VALID")).toBe(true);
    const attempts = await prisma.checkinAttempt.findMany({ where: { eventId } });
    expect(attempts.map((a) => a.result)).toEqual(["INVALID", "INVALID", "INVALID"]);
  });

  it("refuses a ticket of another event, and a canceled one", async () => {
    const organizer = await user("ORGANIZER");
    const forro = await eventWithTickets(["Ana Souza", "Bia Reis"], organizer);
    const samba = await eventWithTickets(["Caio Lima"], organizer);
    const elsewhere = await eventWithTickets(["Davi Melo"]);
    const [ana, bia] = forro.tickets;
    const [caio] = samba.tickets;
    const [davi] = elsewhere.tickets;
    if (!ana || !bia || !caio || !davi) throw new Error("no tickets");

    expect((await organizer.scan(forro.eventId, caio.token).expect(200)).body).toEqual({
      result: "WRONG_EVENT",
    });
    expect((await organizer.scan(forro.eventId, davi.token).expect(200)).body).toEqual({
      result: "WRONG_EVENT",
    });
    // Typed codes: told apart among the organizer's own events only.
    expect((await organizer.code(forro.eventId, caio.code).expect(200)).body).toEqual({
      result: "WRONG_EVENT",
    });
    expect((await organizer.code(forro.eventId, davi.code).expect(200)).body).toEqual({
      result: "INVALID",
    });

    await prisma.ticket.update({
      where: { id: bia.id },
      data: { status: "CANCELED", canceledAt: PAID_AT },
    });
    expect((await organizer.scan(forro.eventId, bia.token).expect(200)).body).toEqual({
      result: "INVALID",
      ticket: { code: bia.code, holderName: "Bia Reis", ticketType: "Pista" },
    });
    // Nothing of the other events went in.
    const states = await prisma.ticket.findMany({
      where: { id: { in: [caio.id, davi.id] } },
      select: { status: true },
    });
    expect(states.map((s) => s.status)).toEqual(["VALID", "VALID"]);
  });

  it("lets a ticket in by its code, however it is typed", async () => {
    const { eventId, door, tickets } = await eventWithTickets(["Ana Souza"]);
    const [ana] = tickets;
    if (!ana) throw new Error("no ticket");

    const typed = ana.code.toLowerCase().replace("vira-", "").replace("-", " ");
    expect((await door.code(eventId, typed).expect(200)).body).toMatchObject({ result: "VALID" });
    expect((await door.code(eventId, ana.code).expect(200)).body).toMatchObject({
      result: "ALREADY_USED",
    });
    expectProblem(await door.code(eventId, "VIRA-123").expect(400), "validation-failed");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: ana.id } });
    expect(audit.metadata).toEqual({ eventId, method: "code" });
  });

  it("opens the door only to the event's organizer", async () => {
    const { eventId, tickets } = await eventWithTickets(["Ana Souza"]);
    const [ana] = tickets;
    if (!ana) throw new Error("no ticket");
    const intruder = await user("ORGANIZER");
    await eventWithTickets(["Bia Reis"], intruder);
    const buyer = await user("BUYER");

    expectProblem(await intruder.scan(eventId, ana.token).expect(404), "not-found");
    expectProblem(await intruder.code(eventId, ana.code).expect(404), "not-found");
    expectProblem(await intruder.stats(eventId).expect(404), "not-found");
    expectProblem(await buyer.scan(eventId, ana.token).expect(403), "forbidden");
    await api().post("/api/v1/checkin/scan").send({ eventId, token: ana.token }).expect(401);

    const row = await prisma.ticket.findUniqueOrThrow({ where: { id: ana.id } });
    expect(row.status).toBe("VALID");
    expect(await prisma.checkinAttempt.count({ where: { eventId } })).toBe(0);
  });

  it("counts the entries and lists the latest reads of the event", async () => {
    const { eventId, door, tickets } = await eventWithTickets(["Ana Souza", "Caio Lima"]);
    const [ana, caio] = tickets;
    if (!ana || !caio) throw new Error("no ticket");

    expect(checkinStatsSchema.parse((await door.stats(eventId).expect(200)).body)).toEqual({
      checkedIn: 0,
      total: 2,
      lastScans: [],
    });
    await door.scan(eventId, ana.token).expect(200);
    clock.current = new Date(clock.current.getTime() + 1000);
    await door.scan(eventId, "lixo").expect(200);
    clock.current = new Date(clock.current.getTime() + 1000);
    await door.code(eventId, ana.code).expect(200);

    const stats = checkinStatsSchema.parse((await door.stats(eventId).expect(200)).body);
    expect(stats).toMatchObject({ checkedIn: 1, total: 2 });
    expect(
      stats.lastScans.map((scan) => [scan.result, scan.method, scan.ticket?.holderName]),
    ).toEqual([
      ["ALREADY_USED", "CODE", "Ana Souza"],
      ["INVALID", "QR", undefined],
      ["VALID", "QR", "Ana Souza"],
    ]);
  });

  it("keeps typed codes to 20 a minute per operator", async () => {
    const { eventId, door } = await eventWithTickets(["Ana Souza"]);
    for (let i = 0; i < 20; i++) {
      await door.code(eventId, "VIRA-0000-0000").expect(200);
    }
    const refused = await door.code(eventId, "VIRA-0000-0000").expect(429);
    expectProblem(refused, "rate-limited");
    expect(refused.headers["retry-after"]).toBeDefined();
    expect(await prisma.checkinAttempt.count({ where: { eventId } })).toBe(20);
  });
});
