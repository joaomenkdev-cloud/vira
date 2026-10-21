import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import type { RateLimiter } from "../../../platform/rate-limit/rate-limiter.js";
import { RateLimitExceededError } from "../../../platform/rate-limit/rate-limiter.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import {
  PaymentGatewayError,
  PaymentIntents,
  PaymentsUnavailableError,
} from "../../payments/application/public-api.js";
import type { Caller } from "./buyer.js";
import { CancelOrder } from "./cancel-order.js";
import { InvalidOrderError, OrderNotFoundError, OrderStateError } from "./errors.js";
import { ExpireOrder } from "./expire-order.js";
import { ExtendOrder } from "./extend-order.js";
import { InMemoryOrderStore, RecordingScheduler } from "./in-memory-orders.fakes.js";
import { OrderEvents, type PaidOrder } from "./order-events.js";
import { OrderExpiry } from "./order-expiry.js";
import { SetHolders } from "./set-holders.js";
import { SettlePayment } from "./settle-payment.js";
import { StartPayment } from "./start-payment.js";
import { SweepExpiredOrders } from "./sweep-expired-orders.js";

const ana: Caller = { id: "0192a0e4-0000-7000-8000-00000000a0a0", role: "BUYER" };
const bia: Caller = { id: "0192a0e4-0000-7000-8000-00000000b0b0", role: "BUYER" };
const EVENT = "0192a0e4-0000-7000-8000-0000000e0001";
const PISTA = "0192a0e4-0000-7000-8000-0000000f0002";
const CAMAROTE = "0192a0e4-0000-7000-8000-0000000f0001";
const T0 = new Date("2026-11-01T12:00:00Z");
// A fake key: it names no Stripe account (.gitleaks.toml).
const PUBLISHABLE_KEY = "pk_test_viraFakePublishable0";

type Gateway = ConstructorParameters<typeof PaymentIntents>[0];
type NewIntent = Parameters<Gateway["createPaymentIntent"]>[0];

/** Stripe as the orders see it: one PaymentIntent per idempotency key. */
class FakeGateway implements Gateway {
  readonly created: NewIntent[] = [];
  down = false;

  createPaymentIntent(intent: NewIntent) {
    if (this.down) return Promise.reject(new PaymentGatewayError("unreachable"));
    let index = this.created.findIndex((c) => c.idempotencyKey === intent.idempotencyKey);
    if (index < 0) index = this.created.push(intent) - 1;
    return this.retrievePaymentIntent(`pi_fake${String(index + 1).padStart(4, "0")}`);
  }

  refundPaymentIntent() {
    return Promise.reject(new Error("not used here"));
  }

  retrievePaymentIntent(id: string) {
    if (this.down) return Promise.reject(new PaymentGatewayError("unreachable"));
    const intent = this.created[Number(id.slice(-4)) - 1];
    if (!intent) return Promise.reject(new PaymentGatewayError("invalid_request_error"));
    return Promise.resolve({
      id,
      clientSecret: `${id}_secret_fake`,
      amountCents: intent.amountCents,
      status: "requires_payment_method",
    });
  }
}

const paymentsConfig = (stripe: boolean) =>
  ({
    payments: {
      mode: "test",
      stripe: stripe
        ? { secretKey: "sk_test_viraFakeSecret000000", publishableKey: PUBLISHABLE_KEY }
        : undefined,
    },
  }) as AppConfig;

function setup() {
  const clock = { current: T0, now: () => clock.current };
  const advance = (minutes: number) => {
    clock.current = new Date(clock.current.getTime() + minutes * 60_000);
  };
  let n = 0;
  const ids = { next: () => `0192a0e4-2222-7000-8000-${String(++n).padStart(12, "0")}` };
  const store = new InMemoryOrderStore();
  store.events.set(EVENT, {
    id: EVENT,
    slug: "noite-de-forro-a1b2c3",
    title: "Noite de forró",
    startsAt: new Date("2026-12-05T22:00:00Z"),
    endsAt: new Date("2026-12-06T03:00:00Z"),
    timezone: "America/Sao_Paulo",
    status: "PUBLISHED",
  });
  for (const [id, name] of [
    [PISTA, "Pista"],
    [CAMAROTE, "Camarote"],
  ] as const) {
    store.stock.set(id, {
      id,
      eventId: EVENT,
      name,
      priceCents: 8000,
      capacity: 10,
      sold: 0,
      reserved: 0,
      maxPerOrder: 10,
      salesStartAt: null,
      salesEndAt: null,
    });
  }
  const auditEntries: Record<string, unknown>[] = [];
  const audit = new AuditLog(
    {
      append: (entry: Record<string, unknown>) => {
        auditEntries.push(entry);
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  const outboxMessages: { type: string; payload: Record<string, unknown> }[] = [];
  const outbox = new Outbox(
    {
      append: (message: { type: string; payload: Record<string, unknown> }) => {
        outboxMessages.push(message);
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  const warnings: string[] = [];
  const logger = { warn: (_: unknown, msg: string) => warnings.push(msg) } as unknown as PinoLogger;
  const paidOrders: PaidOrder[] = [];
  const orderEvents = new OrderEvents();
  orderEvents.onOrderPaid((order) => {
    paidOrders.push(order);
    return Promise.resolve();
  });
  const settlePayment = new SettlePayment(store, store, clock, outbox, audit, orderEvents, logger);
  const scheduler = new RecordingScheduler();
  const gateway = new FakeGateway();
  let paymentHits = 0;
  const limiter: RateLimiter = {
    hit: (rule) => {
      paymentHits++;
      return Promise.resolve({
        allowed: paymentHits <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - paymentHits),
        resetSeconds: 60,
      });
    },
  };
  const startPayment = (stripe = true) =>
    new StartPayment(store, limiter, clock, new PaymentIntents(gateway, paymentsConfig(stripe)));
  const expireOrder = new ExpireOrder(store, clock, new OrderExpiry(store, store), audit);

  /**
   * A pending order of `buyer` made now, holding 2 "Pista" and 1 "Camarote", with its
   * holders named ("Ana", "Caio" and "Duda") unless `named` is false.
   */
  async function pendingOrder(buyer: Caller = ana, { named = true } = {}): Promise<string> {
    const id = ids.next();
    const pistaLine = ids.next();
    const camaroteLine = ids.next();
    const stockOf = (ticketTypeId: string) => store.stock.get(ticketTypeId);
    const pista = stockOf(PISTA);
    const camarote = stockOf(CAMAROTE);
    if (!pista || !camarote) throw new Error("no stock");
    pista.reserved += 2;
    camarote.reserved += 1;
    await store.insert({
      id,
      publicCode: `VIRA-ORD-0000-${String(n).padStart(4, "0")}`,
      buyerId: buyer.id,
      eventId: EVENT,
      totalCents: 24000,
      expiresAt: new Date(clock.current.getTime() + 10 * 60_000),
      idempotencyKey: id,
      requestHash: new Uint8Array(32),
      buyerName: "Ana",
      buyerEmail: "ana@exemplo.com",
      createdAt: clock.current,
      items: [
        { id: pistaLine, ticketTypeId: PISTA, quantity: 2, unitPriceCents: 8000 },
        { id: camaroteLine, ticketTypeId: CAMAROTE, quantity: 1, unitPriceCents: 8000 },
      ],
    });
    if (named) {
      store.holders.set(
        id,
        new Map([
          [pistaLine, ["Ana", "Caio"]],
          [camaroteLine, ["Duda"]],
        ]),
      );
    }
    return id;
  }

  return {
    clock,
    advance,
    store,
    auditEntries,
    scheduler,
    pendingOrder,
    expire: expireOrder,
    sweep: new SweepExpiredOrders(store, clock, expireOrder),
    extend: new ExtendOrder(store, scheduler, clock),
    cancel: new CancelOrder(store, store, store, clock, audit),
    setHolders: new SetHolders(store, clock),
    gateway,
    startPayment,
    outboxMessages,
    paidOrders,
    warnings,
    /** Applies a succeeded payment as the webhook does, then runs what follows the commit. */
    settle: async (
      orderId: string,
      { paymentIntentId = "pi_fake0001", amountCents = 24000 } = {},
    ) => {
      const after = await store.run((tx) =>
        settlePayment.execute({ paymentIntentId, orderId, amountCents, currency: "BRL" }, tx),
      );
      await after?.();
    },
    held: () => [store.stock.get(PISTA)?.reserved, store.stock.get(CAMAROTE)?.reserved],
    sold: () => [store.stock.get(PISTA)?.sold, store.stock.get(CAMAROTE)?.sold],
    statusOf: (id: string) => store.orders.get(id)?.status,
  };
}

describe("expiring an order", () => {
  it("does nothing before its time, then expires it and gives the tickets back once", async () => {
    const s = setup();
    const id = await s.pendingOrder();

    s.advance(9);
    expect(await s.expire.execute(id)).toBe(false);
    expect(s.statusOf(id)).toBe("PENDING");

    s.advance(1);
    expect(await s.expire.execute(id)).toBe(true);
    expect(s.store.orders.get(id)).toMatchObject({ status: "EXPIRED", expiredAt: s.clock.current });
    expect(s.held()).toEqual([0, 0]);
    // The job may run again (a retry, the sweep): nothing changes.
    expect(await s.expire.execute(id)).toBe(false);
    expect(s.held()).toEqual([0, 0]);
    expect(s.auditEntries.map((e) => [e["action"], e["entityId"], e["actorRole"]])).toEqual([
      ["order.expired", id, "SYSTEM"],
    ]);
  });

  it("leaves alone an order that was canceled before its job ran", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    await s.cancel.execute(ana, id);
    s.advance(10);
    expect(await s.expire.execute(id)).toBe(false);
    expect(s.statusOf(id)).toBe("CANCELED");
    expect(s.held()).toEqual([0, 0]);
  });

  it("leaves alone an order that was paid before its job ran", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    const row = s.store.orders.get(id);
    if (row) row.status = "PAID";
    s.advance(10);
    expect(await s.expire.execute(id)).toBe(false);
    expect(s.statusOf(id)).toBe("PAID");
    expect(s.held()).toEqual([2, 1]);
  });

  it("sweeps every overdue order, and only those", async () => {
    const s = setup();
    const first = await s.pendingOrder(ana);
    s.advance(5);
    const second = await s.pendingOrder(bia);
    expect(s.held()).toEqual([4, 2]);

    s.advance(5);
    expect(await s.sweep.execute()).toBe(1);
    expect([s.statusOf(first), s.statusOf(second)]).toEqual(["EXPIRED", "PENDING"]);
    expect(s.held()).toEqual([2, 1]);

    s.advance(5);
    expect(await s.sweep.execute()).toBe(1);
    expect(await s.sweep.execute()).toBe(0);
    expect(s.held()).toEqual([0, 0]);
  });
});

describe("extending a reservation", () => {
  it("adds 10 minutes once, in the last 2 minutes, and schedules the new end", async () => {
    const s = setup();
    const id = await s.pendingOrder();

    s.advance(7);
    await expect(s.extend.execute(ana, id)).rejects.toThrow(
      new OrderStateError("A reserva só pode ser estendida nos 2 minutos finais."),
    );

    s.advance(1.5);
    const extended = await s.extend.execute(ana, id);
    expect(extended).toMatchObject({
      status: "PENDING",
      expiresAt: new Date("2026-11-01T12:20:00Z"),
      extensionCount: 1,
    });
    expect(s.scheduler.scheduled).toEqual([`${id} @ 2026-11-01T12:20:00.000Z`]);
    expect(s.held()).toEqual([2, 1]);

    await expect(s.extend.execute(ana, id)).rejects.toThrow(
      new OrderStateError("Esta reserva já foi estendida uma vez."),
    );

    // The job of the old end finds it still has time.
    s.advance(1.5);
    expect(await s.expire.execute(id)).toBe(false);
    s.advance(10);
    expect(await s.expire.execute(id)).toBe(true);
    expect(s.held()).toEqual([0, 0]);
  });

  it("refuses a reservation whose time is up, even before it was expired", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    s.advance(10);
    await expect(s.extend.execute(ana, id)).rejects.toThrow(OrderStateError);
    expect(s.scheduler.scheduled).toEqual([]);
  });

  it("does not find someone else's order", async () => {
    const s = setup();
    const id = await s.pendingOrder(ana);
    s.advance(9);
    await expect(s.extend.execute(bia, id)).rejects.toThrow(OrderNotFoundError);
  });
});

describe("canceling an order", () => {
  it("gives the tickets back and answers the same order when asked again", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    s.advance(3);

    const canceled = await s.cancel.execute(ana, id, { requestId: "req-9" });
    expect(canceled.status).toBe("CANCELED");
    expect(s.store.orders.get(id)).toMatchObject({ canceledAt: s.clock.current });
    expect(s.held()).toEqual([0, 0]);

    expect((await s.cancel.execute(ana, id)).status).toBe("CANCELED");
    expect(s.held()).toEqual([0, 0]);
    expect(s.auditEntries).toEqual([
      expect.objectContaining({
        action: "order.canceled",
        entityId: id,
        actorId: ana.id,
        requestId: "req-9",
      }),
    ]);
  });

  it("refuses an order that already ended another way", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    s.advance(10);
    await s.expire.execute(id);
    await expect(s.cancel.execute(ana, id)).rejects.toThrow(
      new OrderStateError("Esta reserva já expirou e os ingressos foram liberados."),
    );
    expect(s.statusOf(id)).toBe("EXPIRED");
  });

  it("does not find someone else's order, nor touch it", async () => {
    const s = setup();
    const id = await s.pendingOrder(ana);
    await expect(s.cancel.execute(bia, id)).rejects.toThrow(OrderNotFoundError);
    expect(s.statusOf(id)).toBe("PENDING");
    expect(s.held()).toEqual([2, 1]);
  });
});

describe("starting the payment", () => {
  it("creates one PaymentIntent for the order's stored total, and answers it again", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    const first = await s.startPayment().execute(ana, id);
    expect(first).toEqual({
      paymentIntentId: "pi_fake0001",
      clientSecret: "pi_fake0001_secret_fake",
      publishableKey: PUBLISHABLE_KEY,
    });
    expect(s.gateway.created).toEqual([
      { orderId: id, amountCents: 24000, currency: "BRL", idempotencyKey: `pi:${id}` },
    ]);
    expect(s.store.orders.get(id)?.paymentIntentId).toBe("pi_fake0001");

    s.advance(2);
    expect(await s.startPayment().execute(ana, id)).toEqual(first);
    expect(s.gateway.created).toHaveLength(1);
    expect(s.statusOf(id)).toBe("PENDING");
  });

  it("refuses an order that is no longer pending or whose time is up", async () => {
    const s = setup();
    const canceled = await s.pendingOrder(ana);
    await s.cancel.execute(ana, canceled);
    await expect(s.startPayment().execute(ana, canceled)).rejects.toThrow(OrderStateError);

    const overdue = await s.pendingOrder(bia);
    s.advance(10);
    await expect(s.startPayment().execute(bia, overdue)).rejects.toThrow(OrderStateError);
    expect(s.gateway.created).toEqual([]);
  });

  it("does not find someone else's order", async () => {
    const s = setup();
    const id = await s.pendingOrder(ana);
    await expect(s.startPayment().execute(bia, id)).rejects.toThrow(OrderNotFoundError);
    expect(s.gateway.created).toEqual([]);
  });

  it("says payments are off without Stripe keys, and when Stripe fails", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    await expect(s.startPayment(false).execute(ana, id)).rejects.toThrow(PaymentsUnavailableError);
    s.gateway.down = true;
    await expect(s.startPayment().execute(ana, id)).rejects.toThrow(PaymentGatewayError);
    expect(s.store.orders.get(id)?.paymentIntentId).toBeNull();
  });

  it("counts the calls against the account's budget", async () => {
    const s = setup();
    const id = await s.pendingOrder();
    for (let i = 0; i < 10; i++) await s.startPayment().execute(ana, id);
    await expect(s.startPayment().execute(ana, id)).rejects.toThrow(RateLimitExceededError);
  });
});

describe("settling a payment", () => {
  async function paidFor(s: ReturnType<typeof setup>, buyer: Caller = ana) {
    const id = await s.pendingOrder(buyer);
    const { paymentIntentId } = await s.startPayment().execute(buyer, id);
    return { id, paymentIntentId };
  }

  it("turns a pending order into a paid one, and its held tickets into sold ones, once", async () => {
    const s = setup();
    const { id, paymentIntentId } = await paidFor(s);

    await s.settle(id, { paymentIntentId });
    expect(s.store.orders.get(id)).toMatchObject({ status: "PAID", paidAt: s.clock.current });
    expect([s.held(), s.sold()]).toEqual([
      [0, 0],
      [2, 1],
    ]);
    // Its tickets are issued in the same transaction, one per unit of each line.
    const items = s.store.orders.get(id)?.items ?? [];
    expect(s.paidOrders).toEqual([
      {
        orderId: id,
        eventId: EVENT,
        buyerName: "Ana",
        lines: items.map((item) => ({
          orderItemId: item.id,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          holderNames: s.store.holders.get(id)?.get(item.id),
        })),
      },
    ]);

    // Stripe may send the same payment in a second event: nothing changes.
    await s.settle(id, { paymentIntentId });
    expect(s.sold()).toEqual([2, 1]);
    expect(s.paidOrders).toHaveLength(1);
    expect(s.auditEntries.map((e) => [e["action"], e["metadata"]])).toEqual([
      ["order.paid", { totalCents: 24000, paymentIntentId, late: false }],
    ]);

    // Nor does the expiration job that was still scheduled.
    s.advance(10);
    expect(await s.expire.execute(id)).toBe(false);
    expect(s.statusOf(id)).toBe("PAID");
  });

  it("ignores a payment that is not the order's own PaymentIntent, or not its total", async () => {
    const s = setup();
    const { id, paymentIntentId } = await paidFor(s);

    await s.settle(id, { paymentIntentId: "pi_somebodyElse" });
    await s.settle(id, { paymentIntentId, amountCents: 100 });
    await s.settle("0192a0e4-2222-7000-8000-999999999999", { paymentIntentId });
    expect(s.statusOf(id)).toBe("PENDING");
    expect(s.held()).toEqual([2, 1]);
    expect(s.paidOrders).toEqual([]);
    expect(s.warnings).toHaveLength(3);
  });

  it("sells the tickets again for a late payment, when they are still there", async () => {
    const s = setup();
    const { id, paymentIntentId } = await paidFor(s);
    s.advance(10);
    await s.expire.execute(id);
    expect(s.held()).toEqual([0, 0]);

    await s.settle(id, { paymentIntentId });
    expect(s.statusOf(id)).toBe("PAID");
    expect([s.held(), s.sold()]).toEqual([
      [0, 0],
      [2, 1],
    ]);
    expect(s.auditEntries.at(-1)).toMatchObject({
      action: "order.paid",
      metadata: { late: true },
    });
    expect(s.paidOrders.map((o) => o.orderId)).toEqual([id]);
  });

  it("refunds a late payment when a line sold out meanwhile, selling none of it", async () => {
    const s = setup();
    const { id, paymentIntentId } = await paidFor(s);
    s.advance(10);
    await s.expire.execute(id);
    const camarote = s.store.stock.get(CAMAROTE);
    if (camarote) camarote.sold = camarote.capacity;

    await s.settle(id, { paymentIntentId });
    expect(s.store.orders.get(id)).toMatchObject({
      status: "REFUNDED",
      refundedAt: s.clock.current,
    });
    // "Pista" was sold again before "Camarote" fell short, and was given back.
    expect(s.sold()).toEqual([0, 10]);
    expect(s.outboxMessages).toEqual([
      expect.objectContaining({
        type: "orders.refund_requested",
        payload: { orderId: id, paymentIntentId },
      }),
    ]);
    expect(s.auditEntries.at(-1)).toMatchObject({
      action: "order.refunded",
      metadata: { reason: "late_payment", totalCents: 24000 },
    });

    await s.settle(id, { paymentIntentId });
    expect(s.outboxMessages).toHaveLength(1);
  });

  it("refunds a payment that arrives after the buyer canceled", async () => {
    const s = setup();
    const { id, paymentIntentId } = await paidFor(s);
    await s.cancel.execute(ana, id);

    await s.settle(id, { paymentIntentId });
    expect(s.statusOf(id)).toBe("REFUNDED");
    expect(s.sold()).toEqual([0, 0]);
    expect(s.outboxMessages.map((m) => m.type)).toEqual(["orders.refund_requested"]);
    expect(s.paidOrders).toEqual([]);
  });
});

describe("naming the holders", () => {
  it("records one name per ticket of every line, and lets the order be paid", async () => {
    const s = setup();
    const id = await s.pendingOrder(ana, { named: false });
    await expect(s.startPayment().execute(ana, id)).rejects.toThrow(
      new OrderStateError("Informe o nome do titular de cada ingresso antes de pagar."),
    );

    const order = await s.store.findOwned(id, ana.id);
    const [pista, camarote] = order?.items ?? [];
    if (!pista || !camarote) throw new Error("no lines");
    const named = await s.setHolders.execute(ana, id, [
      { orderItemId: camarote.id, names: ["Duda"] },
      { orderItemId: pista.id.toUpperCase(), names: ["Ana", "Caio"] },
    ]);
    expect(named.items.map((item) => item.holderNames)).toEqual([["Ana", "Caio"], ["Duda"]]);
    expect((await s.startPayment().execute(ana, id)).paymentIntentId).toBe("pi_fake0001");

    // Saying it again replaces the names.
    const renamed = await s.setHolders.execute(ana, id, [
      { orderItemId: pista.id, names: ["Bia", "Caio"] },
      { orderItemId: camarote.id, names: ["Duda"] },
    ]);
    expect(renamed.items[0]?.holderNames).toEqual(["Bia", "Caio"]);
  });

  it("refuses a missing line, an unknown one or the wrong number of names", async () => {
    const s = setup();
    const id = await s.pendingOrder(ana, { named: false });
    const order = await s.store.findOwned(id, ana.id);
    const [pista, camarote] = order?.items ?? [];
    if (!pista || !camarote) throw new Error("no lines");

    await expect(
      s.setHolders.execute(ana, id, [{ orderItemId: pista.id, names: ["Ana", "Caio"] }]),
    ).rejects.toThrow(new InvalidOrderError("holders", "faltam os titulares de Camarote"));
    await expect(
      s.setHolders.execute(ana, id, [
        { orderItemId: pista.id, names: ["Ana"] },
        { orderItemId: camarote.id, names: ["Duda"] },
      ]),
    ).rejects.toThrow(new InvalidOrderError("holders.0.names", "informe 2 nomes para Pista"));
    await expect(
      s.setHolders.execute(ana, id, [
        { orderItemId: pista.id, names: ["Ana", "Caio"] },
        { orderItemId: camarote.id, names: ["Duda"] },
        { orderItemId: EVENT, names: ["Eva"] },
      ]),
    ).rejects.toThrow(
      new InvalidOrderError("holders.2.orderItemId", "não é uma linha deste pedido"),
    );
    expect(s.store.holders.get(id)).toBeUndefined();
  });

  it("refuses someone else's order and one whose reservation is over", async () => {
    const s = setup();
    const id = await s.pendingOrder(ana, { named: false });
    const lines = (await s.store.findOwned(id, ana.id))?.items.map((item) => ({
      orderItemId: item.id,
      names: Array.from({ length: item.quantity }, () => "Ana"),
    }));
    await expect(s.setHolders.execute(bia, id, lines ?? [])).rejects.toThrow(OrderNotFoundError);
    s.advance(10);
    await expect(s.setHolders.execute(ana, id, lines ?? [])).rejects.toThrow(OrderStateError);
  });
});
