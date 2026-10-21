import { describe, expect, it } from "vitest";

import { AuditLog } from "../../audit/application/public-api.js";
import type { Caller } from "./buyer.js";
import { CancelOrder } from "./cancel-order.js";
import { OrderNotFoundError, OrderStateError } from "./errors.js";
import { ExpireOrder } from "./expire-order.js";
import { ExtendOrder } from "./extend-order.js";
import { InMemoryOrderStore, RecordingScheduler } from "./in-memory-orders.fakes.js";
import { OrderExpiry } from "./order-expiry.js";
import { SweepExpiredOrders } from "./sweep-expired-orders.js";

const ana: Caller = { id: "0192a0e4-0000-7000-8000-00000000a0a0", role: "BUYER" };
const bia: Caller = { id: "0192a0e4-0000-7000-8000-00000000b0b0", role: "BUYER" };
const EVENT = "0192a0e4-0000-7000-8000-0000000e0001";
const PISTA = "0192a0e4-0000-7000-8000-0000000f0002";
const CAMAROTE = "0192a0e4-0000-7000-8000-0000000f0001";
const T0 = new Date("2026-11-01T12:00:00Z");

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
  const scheduler = new RecordingScheduler();
  const expireOrder = new ExpireOrder(store, clock, new OrderExpiry(store, store), audit);

  /** A pending order of `buyer` made now, holding 2 "Pista" and 1 "Camarote". */
  async function pendingOrder(buyer: Caller = ana): Promise<string> {
    const id = ids.next();
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
        { id: ids.next(), ticketTypeId: PISTA, quantity: 2, unitPriceCents: 8000 },
        { id: ids.next(), ticketTypeId: CAMAROTE, quantity: 1, unitPriceCents: 8000 },
      ],
    });
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
    held: () => [store.stock.get(PISTA)?.reserved, store.stock.get(CAMAROTE)?.reserved],
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
