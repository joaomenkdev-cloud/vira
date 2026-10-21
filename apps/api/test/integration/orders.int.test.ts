import { orderSchema, problemDetailsSchema } from "@vira/shared";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ExpireOrder } from "../../src/modules/orders/application/expire-order.js";
import { OrderSweeper } from "../../src/modules/orders/infra/order-sweeper.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri, type ProblemType } from "../../src/platform/errors/problem-types.js";
import type { RateLimiter } from "../../src/platform/rate-limit/rate-limiter.js";
import { RATE_LIMITER } from "../../src/platform/rate-limit/rate-limiter.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { QueueService } from "../../src/platform/queue/queue.module.js";
import { AccessTokens } from "../../src/platform/security/access-token.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

/** A clock the tests move by hand (reservations that run out). */
const clock = { current: new Date("2026-11-01T12:00:00Z"), now: () => clock.current };
const advance = (minutes: number) => {
  clock.current = new Date(clock.current.getTime() + minutes * 60_000);
};

/** Polls until `check` returns a value, or fails after `timeoutMs`. */
async function eventually<T>(
  check: () => Promise<T | null | undefined>,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Every request comes from 127.0.0.1: the budgets have suites of their own. */
const unlimited: RateLimiter = {
  hit: (rule) =>
    Promise.resolve({ allowed: true, limit: rule.limit, remaining: rule.limit, resetSeconds: 60 }),
};

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

describe.skipIf(!dockerAvailable)("orders (PostgreSQL)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  const api = () => request(testApp.app.getHttpServer());

  /** A signed-in buyer: an account and the bearer header of a session of theirs. */
  async function buyer() {
    const userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: `c-${userId}@exemplo.com`,
        name: "Compradora",
        emailVerifiedAt: clock.current,
        createdAt: clock.current,
      },
    });
    // Issued per request: the tests move the clock past an access token's lifetime.
    const sid = uuidv7();
    const auth = () =>
      `Bearer ${testApp.app.get(AccessTokens).issue({ sub: userId, role: "BUYER", sid }).token}`;
    return {
      userId,
      order: (body: object, key: string = uuidv7()) =>
        api()
          .post("/api/v1/orders")
          .set("Authorization", auth())
          .set("Idempotency-Key", key)
          .send(body),
      get: (path: string) => api().get(`/api/v1${path}`).set("Authorization", auth()),
      post: (path: string) => api().post(`/api/v1${path}`).set("Authorization", auth()),
    };
  }

  interface TicketTypeSeed {
    readonly name: string;
    readonly priceCents?: number;
    readonly capacity: number;
    readonly maxPerOrder?: number;
  }

  /** A published event and its ticket types, written straight to the tables. */
  async function publishedEvent<const T extends readonly TicketTypeSeed[]>(ticketTypes: T) {
    const organizerUserId = uuidv7();
    const organizerId = uuidv7();
    const eventId = uuidv7();
    await prisma.user.create({
      data: {
        id: organizerUserId,
        email: `o-${organizerUserId}@exemplo.com`,
        name: "Organizadora",
        role: "ORGANIZER",
        emailVerifiedAt: clock.current,
        createdAt: clock.current,
      },
    });
    await prisma.organizerProfile.create({
      data: {
        id: organizerId,
        userId: organizerUserId,
        displayName: "Coletivo",
        slug: `coletivo-${organizerId.slice(-12)}`,
        createdAt: clock.current,
      },
    });
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
        publishedAt: clock.current,
        createdAt: clock.current,
      },
    });
    const ids: string[] = [];
    for (const [index, ticketType] of ticketTypes.entries()) {
      const id = uuidv7();
      ids.push(id);
      await prisma.ticketType.create({
        data: {
          id,
          eventId,
          name: ticketType.name,
          priceCents: ticketType.priceCents ?? 8000,
          capacity: ticketType.capacity,
          maxPerOrder: ticketType.maxPerOrder ?? 10,
          sortOrder: index,
          createdAt: clock.current,
        },
      });
    }
    return { eventId, organizerUserId, ticketTypeIds: ids as { [K in keyof T]: string } };
  }

  const stockOf = (id: string) =>
    prisma.ticketType.findUniqueOrThrow({
      where: { id },
      select: { capacity: true, sold: true, reserved: true },
    });

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      // Embedded: the expiration jobs and the sweep run in this same process.
      env: {
        DATABASE_URL: infrastructure.databaseUrl,
        REDIS_URL: infrastructure.redisUrl,
        WORKER_MODE: "embedded",
      },
      override: (builder) =>
        builder
          .overrideProvider(CLOCK)
          .useValue(clock)
          .overrideProvider(RATE_LIMITER)
          .useValue(unlimited),
    });
    prisma = testApp.app.get(PrismaService);
    // Listening once: concurrent requests would otherwise each start the server.
    await testApp.app.listen(0, "127.0.0.1");
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("reserves the tickets for 10 minutes at the prices in the database", async () => {
    const {
      eventId,
      ticketTypeIds: [pista, camarote],
    } = await publishedEvent([
      { name: "Pista", capacity: 100 },
      { name: "Camarote", priceCents: 25000, capacity: 10 },
    ]);
    const ana = await buyer();

    const response = await ana
      .order({
        eventId,
        items: [
          { ticketTypeId: camarote, quantity: 1 },
          { ticketTypeId: pista, quantity: 2 },
        ],
      })
      .expect(201);
    const order = orderSchema.parse(response.body);
    expect(response.headers["location"]).toBe(`/api/v1/orders/${order.id}`);
    expect(order).toMatchObject({
      status: "PENDING",
      event: { id: eventId, title: "Noite de forró" },
      items: [
        { ticketTypeId: pista, name: "Pista", quantity: 2, subtotal: { amountCents: 16000 } },
        {
          ticketTypeId: camarote,
          name: "Camarote",
          quantity: 1,
          unitPrice: { amountCents: 25000 },
        },
      ],
      total: { amountCents: 41000, currency: "BRL" },
      expiresAt: "2026-11-01T12:10:00.000Z",
      extensionAvailable: true,
      paidAt: null,
    });
    expect(await stockOf(pista)).toMatchObject({ reserved: 2, sold: 0 });
    expect(await stockOf(camarote)).toMatchObject({ reserved: 1 });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({
      buyerName: "Compradora",
      buyerEmail: `c-${ana.userId}@exemplo.com`,
    });
    const audit = await prisma.auditLog.findMany({ where: { entityId: order.id } });
    expect(audit.map((r) => [r.action, r.actorId, r.metadata])).toEqual([
      ["order.created", ana.userId, { eventId, totalCents: 41000, ticketCount: 3 }],
    ]);

    // Only its buyer sees it.
    expect(orderSchema.parse((await ana.get(`/orders/${order.id}`).expect(200)).body)).toEqual(
      order,
    );
    expectProblem(await (await buyer()).get(`/orders/${order.id}`).expect(404), "not-found");
  });

  it("sells the last ticket exactly once among concurrent buyers", async () => {
    const {
      eventId,
      ticketTypeIds: [last],
    } = await publishedEvent([{ name: "Última vaga", capacity: 1 }]);
    const buyers = await Promise.all(Array.from({ length: 25 }, buyer));

    const responses = await Promise.all(
      buyers.map((b) => b.order({ eventId, items: [{ ticketTypeId: last, quantity: 1 }] })),
    );

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, ...Array<number>(24).fill(409)]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expectProblem(response, "insufficient-inventory");
      expect(problemDetailsSchema.parse(response.body).detail).toBe(
        'Os ingressos de "Última vaga" esgotaram.',
      );
    }
    expect(await stockOf(last)).toEqual({ capacity: 1, sold: 0, reserved: 1 });
    expect(await prisma.order.count({ where: { eventId } })).toBe(1);
  });

  it("never holds more than the capacity when concurrent orders want several each", async () => {
    const {
      eventId,
      ticketTypeIds: [a, b],
    } = await publishedEvent([
      { name: "Pista", capacity: 7 },
      { name: "Meia", capacity: 5 },
    ]);
    const buyers = await Promise.all(Array.from({ length: 12 }, buyer));

    // Items in both orders: without the id order, these would deadlock.
    const responses = await Promise.all(
      buyers.map((buyerOf, i) =>
        buyerOf.order({
          eventId,
          items:
            i % 2 === 0
              ? [
                  { ticketTypeId: a, quantity: 2 },
                  { ticketTypeId: b, quantity: 1 },
                ]
              : [
                  { ticketTypeId: b, quantity: 1 },
                  { ticketTypeId: a, quantity: 2 },
                ],
        }),
      ),
    );

    expect(responses.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const created = responses.filter((r) => r.status === 201).length;
    expect(created).toBe(3); // 3 × 2 of the 7 in "Pista"
    expect(await stockOf(a)).toMatchObject({ reserved: 6 });
    expect(await stockOf(b)).toMatchObject({ reserved: 3 });
  });

  it("answers a repeated request with the same order, and refuses the key with another body", async () => {
    const {
      eventId,
      ticketTypeIds: [pista],
    } = await publishedEvent([{ name: "Pista", capacity: 100 }]);
    const ana = await buyer();
    const key = uuidv7();
    const body = { eventId, items: [{ ticketTypeId: pista, quantity: 2 }] };

    const first = await ana.order(body, key).expect(201);
    advance(1);
    const again = await ana.order(body, key).expect(200);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    expect(again.headers["location"]).toBeUndefined();
    expect(again.body).toEqual(first.body);
    expect(await stockOf(pista)).toMatchObject({ reserved: 2 });

    const reused = await ana
      .order({ eventId, items: [{ ticketTypeId: pista, quantity: 3 }] }, key)
      .expect(422);
    expectProblem(reused, "idempotency-key-reused");

    // Another buyer's key is theirs alone, even with the same value.
    const bia = await buyer();
    await bia.order(body, key).expect(201);
    expect(await stockOf(pista)).toMatchObject({ reserved: 4 });
    expect(
      await prisma.auditLog.count({ where: { action: "order.created", actorId: ana.userId } }),
    ).toBe(1);
  });

  it("makes a single order out of concurrent retries of the same request", async () => {
    const {
      eventId,
      ticketTypeIds: [pista],
    } = await publishedEvent([{ name: "Pista", capacity: 100 }]);
    const ana = await buyer();
    const key = uuidv7();
    const body = { eventId, items: [{ ticketTypeId: pista, quantity: 1 }] };

    const responses = await Promise.all(Array.from({ length: 8 }, () => ana.order(body, key)));

    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    for (const response of responses.filter((r) => r.status !== 201)) {
      if (response.status === 200) expect(response.headers["idempotent-replayed"]).toBe("true");
      else expectProblem(response, "request-in-progress");
    }
    expect(await prisma.order.count({ where: { buyerId: ana.userId } })).toBe(1);
    expect(await stockOf(pista)).toMatchObject({ reserved: 1 });
  });

  it("lets a buyer hold one pending order per event, even with concurrent requests", async () => {
    const {
      eventId,
      ticketTypeIds: [pista],
    } = await publishedEvent([{ name: "Pista", capacity: 100 }]);
    const ana = await buyer();
    const body = { eventId, items: [{ ticketTypeId: pista, quantity: 1 }] };

    const responses = await Promise.all(Array.from({ length: 6 }, () => ana.order(body)));

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409, 409]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expectProblem(response, "pending-order-exists");
    }
    expect(await stockOf(pista)).toMatchObject({ reserved: 1 });
  });

  it("gives way to a new order once the pending one's time is up, returning its tickets once", async () => {
    const {
      eventId,
      ticketTypeIds: [pista],
    } = await publishedEvent([{ name: "Pista", capacity: 3 }]);
    const ana = await buyer();
    const first = orderSchema.parse(
      (await ana.order({ eventId, items: [{ ticketTypeId: pista, quantity: 3 }] }).expect(201))
        .body,
    );
    advance(9);
    expectProblem(
      await ana.order({ eventId, items: [{ ticketTypeId: pista, quantity: 1 }] }).expect(409),
      "pending-order-exists",
    );

    advance(1);
    await ana.order({ eventId, items: [{ ticketTypeId: pista, quantity: 2 }] }).expect(201);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      status: "EXPIRED",
      expiredAt: clock.current,
    });
    expect(await stockOf(pista)).toMatchObject({ reserved: 2 });
    expect(
      orderSchema.parse((await ana.get(`/orders/${first.id}`).expect(200)).body),
    ).toMatchObject({
      status: "EXPIRED",
      extensionAvailable: false,
    });
  });

  it("refuses what is not on sale and what goes over the limits", async () => {
    const {
      eventId,
      ticketTypeIds: [pista, camarote],
    } = await publishedEvent([
      { name: "Pista", capacity: 100, maxPerOrder: 4 },
      { name: "Camarote", capacity: 2 },
    ]);
    const other = await publishedEvent([{ name: "Outro", capacity: 10 }]);
    const ana = await buyer();

    const tooMany = await ana
      .order({ eventId, items: [{ ticketTypeId: pista, quantity: 5 }] })
      .expect(400);
    expectProblem(tooMany, "validation-failed");
    expect(problemDetailsSchema.parse(tooMany.body).errors).toEqual([
      { path: "items.0.quantity", message: 'No máximo 4 ingresso(s) de "Pista" por pedido.' },
    ]);

    const short = await ana
      .order({ eventId, items: [{ ticketTypeId: camarote, quantity: 3 }] })
      .expect(409);
    expectProblem(short, "insufficient-inventory");
    expect(problemDetailsSchema.parse(short.body).detail).toBe(
      'Restam 2 ingresso(s) de "Camarote".',
    );

    expectProblem(
      await ana
        .order({ eventId, items: [{ ticketTypeId: other.ticketTypeIds[0], quantity: 1 }] })
        .expect(404),
      "not-found",
    );
    expectProblem(
      await ana
        .order({ eventId: uuidv7(), items: [{ ticketTypeId: pista, quantity: 1 }] })
        .expect(404),
      "not-found",
    );

    await prisma.ticketType.update({
      where: { id: pista },
      data: { salesStartAt: new Date("2026-11-10T00:00:00Z") },
    });
    const notYet = await ana
      .order({ eventId, items: [{ ticketTypeId: pista, quantity: 1 }] })
      .expect(422);
    expectProblem(notYet, "sales-closed");

    await prisma.event.update({
      where: { id: eventId },
      data: { status: "CANCELED", canceledAt: clock.current, cancelReason: "Chuva forte" },
    });
    expectProblem(
      await ana.order({ eventId, items: [{ ticketTypeId: camarote, quantity: 1 }] }).expect(422),
      "sales-closed",
    );
    await prisma.event
      .update({ where: { id: other.eventId }, data: { status: "DRAFT", publishedAt: null } })
      .catch(() => undefined);
    await prisma.event.update({
      where: { id: other.eventId },
      data: { status: "DRAFT", publishedAt: null },
    });
    expectProblem(
      await ana
        .order({
          eventId: other.eventId,
          items: [{ ticketTypeId: other.ticketTypeIds[0], quantity: 1 }],
        })
        .expect(404),
      "not-found",
    );
    // Nothing was held by any of the refusals.
    expect(await stockOf(camarote)).toMatchObject({ reserved: 0 });
    expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
  });

  it("keeps a ticket type that was ever ordered, and its capacity above what is held", async () => {
    const {
      eventId,
      organizerUserId,
      ticketTypeIds: [pista, extra],
    } = await publishedEvent([
      { name: "Pista", capacity: 10 },
      { name: "Extra", capacity: 10 },
    ]);
    const ana = await buyer();
    await ana.order({ eventId, items: [{ ticketTypeId: pista, quantity: 4 }] }).expect(201);
    const organizer = (method: "patch" | "delete", id: string) => {
      const { token } = testApp.app
        .get(AccessTokens)
        .issue({ sub: organizerUserId, role: "ORGANIZER", sid: uuidv7() });
      return api()
        [method](`/api/v1/organizer/ticket-types/${id}`)
        .set("Authorization", `Bearer ${token}`);
    };

    expectProblem(await organizer("patch", pista).send({ capacity: 3 }).expect(409), "conflict");
    expectProblem(await organizer("delete", pista).expect(409), "conflict");

    // Once the order expires the stock is free, yet the ticket type stays: it was ordered.
    advance(10);
    await ana.order({ eventId, items: [{ ticketTypeId: extra, quantity: 1 }] }).expect(201);
    expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
    expectProblem(await organizer("delete", pista).expect(409), "conflict");
  });

  it("refuses overbooking in the database itself", async () => {
    const {
      ticketTypeIds: [pista],
    } = await publishedEvent([{ name: "Pista", capacity: 2 }]);
    await expect(
      prisma.ticketType.update({ where: { id: pista }, data: { reserved: 3 } }),
    ).rejects.toThrow(/ticket_types_inventory/);
  });

  describe("expiration, extension and cancellation (V2)", () => {
    const expirations = () => testApp.app.get(QueueService).queue("orders");
    const jobOf = (orderId: string, expiresAt: string) =>
      expirations().getJob(`expire-${orderId}-${new Date(expiresAt).getTime()}`);
    const statusOf = async (orderId: string) =>
      (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

    /** A buyer with a pending order of 2 tickets of a 5-ticket type. */
    async function reservation() {
      const {
        eventId,
        ticketTypeIds: [pista],
      } = await publishedEvent([{ name: "Pista", capacity: 5 }]);
      const ana = await buyer();
      const order = orderSchema.parse(
        (await ana.order({ eventId, items: [{ ticketTypeId: pista, quantity: 2 }] }).expect(201))
          .body,
      );
      return { eventId, pista, ana, order };
    }

    it("schedules a job for the end of the reservation, which expires it and frees the tickets", async () => {
      const { pista, order } = await reservation();
      const job = await jobOf(order.id, order.expiresAt);
      expect(job?.data).toMatchObject({ type: "orders.expire", payload: { orderId: order.id } });
      expect(job?.opts.delay).toBe(10 * 60_000);
      expect(await job?.getState()).toBe("delayed");

      advance(10);
      await job?.promote();
      await eventually(async () => (await statusOf(order.id)) === "EXPIRED");
      expect(await stockOf(pista)).toMatchObject({ reserved: 0, sold: 0 });
      expect(
        await prisma.auditLog.findMany({
          where: { entityId: order.id, action: "order.expired" },
          select: { actorRole: true },
        }),
      ).toEqual([{ actorRole: "SYSTEM" }]);
    });

    it("does nothing when the job runs before the end, or after the order was canceled", async () => {
      const early = await reservation();
      const earlyJob = await jobOf(early.order.id, early.order.expiresAt);
      await earlyJob?.promote();
      await eventually(async () => (await earlyJob?.getState()) === "completed");
      expect(await statusOf(early.order.id)).toBe("PENDING");
      expect(await stockOf(early.pista)).toMatchObject({ reserved: 2 });

      const canceled = await reservation();
      await canceled.ana.post(`/orders/${canceled.order.id}/cancel`).expect(200);
      advance(10);
      const job = await jobOf(canceled.order.id, canceled.order.expiresAt);
      await job?.promote();
      await eventually(async () => (await job?.getState()) === "completed");
      expect(await statusOf(canceled.order.id)).toBe("CANCELED");
      // Given back once: a second release would have gone below zero.
      expect(await stockOf(canceled.pista)).toMatchObject({ reserved: 0 });
    });

    it("sweeps an overdue order whose job was lost", async () => {
      const { pista, order } = await reservation();
      await (await jobOf(order.id, order.expiresAt))?.remove();

      advance(10);
      await testApp.app.get(OrderSweeper).tick();
      expect(await statusOf(order.id)).toBe("EXPIRED");
      expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
    });

    it("frees the tickets once when the buyer cancels while the reservation expires", async () => {
      const { pista, ana, order } = await reservation();
      advance(10);

      const [canceled, expired] = await Promise.all([
        ana.post(`/orders/${order.id}/cancel`),
        testApp.app.get(ExpireOrder).execute(order.id),
      ]);
      const status = await statusOf(order.id);
      expect(status).toBe(expired ? "EXPIRED" : "CANCELED");
      expect(canceled.status).toBe(expired ? 409 : 200);
      expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
    });

    it("extends a reservation once, in its last 2 minutes, and moves its job", async () => {
      const { pista, ana, order } = await reservation();

      advance(7);
      const early = await ana.post(`/orders/${order.id}/extend`).expect(409);
      expectProblem(early, "invalid-state-transition");
      expect(problemDetailsSchema.parse(early.body).detail).toBe(
        "A reserva só pode ser estendida nos 2 minutos finais.",
      );

      advance(1.5);
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => ana.post(`/orders/${order.id}/extend`)),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
      const extended = orderSchema.parse(responses.find((r) => r.status === 200)?.body);
      expect(extended).toMatchObject({
        status: "PENDING",
        expiresAt: new Date(new Date(order.expiresAt).getTime() + 10 * 60_000).toISOString(),
        extensionAvailable: false,
      });
      expect(await jobOf(order.id, extended.expiresAt)).toBeDefined();

      // The job of the first end finds time left.
      advance(1.5);
      const oldJob = await jobOf(order.id, order.expiresAt);
      await oldJob?.promote();
      await eventually(async () => (await oldJob?.getState()) === "completed");
      expect(await statusOf(order.id)).toBe("PENDING");
      expect(await stockOf(pista)).toMatchObject({ reserved: 2 });

      advance(10);
      await (await jobOf(order.id, extended.expiresAt))?.promote();
      await eventually(async () => (await statusOf(order.id)) === "EXPIRED");
      expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
    });

    it("lets the buyer cancel, then order again right away", async () => {
      const { eventId, pista, ana, order } = await reservation();

      const canceled = orderSchema.parse(
        (await ana.post(`/orders/${order.id}/cancel`).expect(200)).body,
      );
      expect(canceled).toMatchObject({ status: "CANCELED", extensionAvailable: false });
      expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
      // Asking again is harmless.
      await ana.post(`/orders/${order.id}/cancel`).expect(200);
      expect(await stockOf(pista)).toMatchObject({ reserved: 0 });
      expect(
        await prisma.auditLog.count({ where: { entityId: order.id, action: "order.canceled" } }),
      ).toBe(1);

      expectProblem(
        await (await buyer()).post(`/orders/${order.id}/cancel`).expect(404),
        "not-found",
      );
      expectProblem(
        await (await buyer()).post(`/orders/${order.id}/extend`).expect(404),
        "not-found",
      );
      await ana.order({ eventId, items: [{ ticketTypeId: pista, quantity: 5 }] }).expect(201);
      expectProblem(
        await ana.post(`/orders/${order.id}/extend`).expect(409),
        "invalid-state-transition",
      );
    });
  });
});
