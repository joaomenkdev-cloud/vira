import type { CreateOrderRequest } from "@vira/shared";
import { describe, expect, it } from "vitest";

import {
  type RateLimiter,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import { AuditLog } from "../../audit/application/public-api.js";
import type { AccountContacts } from "../../users/application/public-api.js";
import type { Caller } from "./buyer.js";
import { CreateOrder } from "./create-order.js";
import {
  EventNotFoundError,
  IdempotencyKeyReusedError,
  InsufficientInventoryError,
  InvalidOrderError,
  OrderNotFoundError,
  PendingOrderExistsError,
  RequestInProgressError,
  SalesClosedError,
  TicketTypeNotFoundError,
} from "./errors.js";
import { GetOrder } from "./get-order.js";
import { InMemoryOrderStore, type StockRow } from "./in-memory-orders.fakes.js";
import { OrderExpiry } from "./order-expiry.js";

const ana: Caller = { id: "0192a0e4-0000-7000-8000-00000000a0a0", role: "BUYER" };
const bia: Caller = { id: "0192a0e4-0000-7000-8000-00000000b0b0", role: "BUYER" };
const EVENT = "0192a0e4-0000-7000-8000-0000000e0001";
const OTHER_EVENT = "0192a0e4-0000-7000-8000-0000000e0002";
const PISTA = "0192a0e4-0000-7000-8000-0000000f0002";
const CAMAROTE = "0192a0e4-0000-7000-8000-0000000f0001";
const ALHEIO = "0192a0e4-0000-7000-8000-0000000f0009";
const key = (n: number) => `0192a0e4-1111-7000-8000-${String(n).padStart(12, "0")}`;

const order = (items: CreateOrderRequest["items"], eventId = EVENT): CreateOrderRequest => ({
  eventId,
  items,
});

function stockRow(row: Partial<StockRow> & Pick<StockRow, "id" | "name">): StockRow {
  return {
    eventId: EVENT,
    priceCents: 8000,
    capacity: 100,
    sold: 0,
    reserved: 0,
    maxPerOrder: 10,
    salesStartAt: null,
    salesEndAt: null,
    ...row,
  };
}

function setup() {
  const clock = { current: new Date("2026-11-01T12:00:00Z"), now: () => clock.current };
  const advance = (minutes: number) => {
    clock.current = new Date(clock.current.getTime() + minutes * 60_000);
  };
  let n = 0;
  const ids = { next: () => `0192a0e4-2222-7000-8000-${String(++n).padStart(12, "0")}` };
  const store = new InMemoryOrderStore();
  const event = {
    id: EVENT,
    slug: "noite-de-forro-a1b2c3",
    title: "Noite de forró",
    startsAt: new Date("2026-12-05T22:00:00Z"),
    endsAt: new Date("2026-12-06T03:00:00Z"),
    timezone: "America/Sao_Paulo",
    status: "PUBLISHED" as const,
  };
  store.events.set(EVENT, event);
  store.events.set(OTHER_EVENT, { ...event, id: OTHER_EVENT, slug: "outro-d4e5f6" });
  store.stock.set(PISTA, stockRow({ id: PISTA, name: "Pista" }));
  store.stock.set(
    CAMAROTE,
    stockRow({ id: CAMAROTE, name: "Camarote", priceCents: 25000, capacity: 2 }),
  );
  store.stock.set(ALHEIO, stockRow({ id: ALHEIO, name: "Outro", eventId: OTHER_EVENT }));

  const hits = new Map<string, number>();
  const limiter: RateLimiter = {
    hit: (rule, subject) => {
      const count = (hits.get(`${rule.name}:${subject}`) ?? 0) + 1;
      hits.set(`${rule.name}:${subject}`, count);
      return Promise.resolve({
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        resetSeconds: 60,
      });
    },
  };
  const contacts = {
    contactOf: (id: string) =>
      Promise.resolve({ name: id === ana.id ? "Ana" : "Bia", email: `${id}@exemplo.com` }),
  } as AccountContacts;
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
  const expiry = new OrderExpiry(store, store);
  return {
    clock,
    advance,
    store,
    auditEntries,
    create: new CreateOrder(store, store, store, limiter, clock, ids, expiry, contacts, audit),
    get: new GetOrder(store),
    reserved: (id: string) => store.stock.get(id)?.reserved,
    stockOf: (id: string) => {
      const row = store.stock.get(id);
      if (!row) throw new Error("unknown ticket type");
      return row;
    },
    eventRow: () => ({ ...event }),
  };
}

describe("creating an order", () => {
  it("holds the tickets for 10 minutes at the prices in the database", async () => {
    const s = setup();
    const { order: created, replayed } = await s.create.execute(
      ana,
      key(1),
      order([
        { ticketTypeId: PISTA, quantity: 2 },
        { ticketTypeId: CAMAROTE, quantity: 1 },
      ]),
      { requestId: "req-1" },
    );
    expect(replayed).toBe(false);
    expect(created).toMatchObject({
      status: "PENDING",
      buyerId: ana.id,
      totalCents: 2 * 8000 + 25000,
      expiresAt: new Date("2026-11-01T12:10:00Z"),
      extensionCount: 0,
    });
    expect(created.publicCode).toMatch(/^VIRA-ORD-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(s.reserved(PISTA)).toBe(2);
    expect(s.reserved(CAMAROTE)).toBe(1);
    expect(s.store.orders.get(created.id)).toMatchObject({ buyerName: "Ana" });
    expect(s.auditEntries).toEqual([
      expect.objectContaining({
        action: "order.created",
        entityId: created.id,
        actorId: ana.id,
        requestId: "req-1",
        metadata: { eventId: EVENT, totalCents: 41000, ticketCount: 3 },
      }),
    ]);
  });

  it("reserves the ticket types in id order, whatever the order of the request", async () => {
    const s = setup();
    await s.create.execute(
      ana,
      key(1),
      order([
        { ticketTypeId: PISTA, quantity: 1 },
        { ticketTypeId: CAMAROTE, quantity: 1 },
      ]),
    );
    expect(s.store.reserveCalls).toEqual([CAMAROTE, PISTA]);
  });

  it("refuses more tickets than are left, and gives back what it already held", async () => {
    const s = setup();
    s.stockOf(PISTA).sold = 100;
    const attempt = s.create.execute(
      ana,
      key(1),
      order([
        { ticketTypeId: CAMAROTE, quantity: 1 },
        { ticketTypeId: PISTA, quantity: 1 },
      ]),
    );
    await expect(attempt).rejects.toMatchObject({
      constructor: InsufficientInventoryError,
      ticketTypeName: "Pista",
      available: 0,
    });
    expect(s.reserved(CAMAROTE)).toBe(0);
    expect(s.store.orders.size).toBe(0);
    expect(s.auditEntries).toEqual([]);
  });

  it("says how many are left when fewer than asked for", async () => {
    const s = setup();
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: CAMAROTE, quantity: 3 }])),
    ).rejects.toMatchObject({ constructor: InsufficientInventoryError, available: 2 });
  });

  it("refuses more than the ticket type allows per order, pointing at the line", async () => {
    const s = setup();
    const attempt = s.create.execute(
      ana,
      key(1),
      order([
        { ticketTypeId: CAMAROTE, quantity: 1 },
        { ticketTypeId: PISTA, quantity: 11 },
      ]),
    );
    await expect(attempt).rejects.toMatchObject({
      constructor: InvalidOrderError,
      path: "items.1.quantity",
    });
    expect(s.reserved(CAMAROTE)).toBe(0);
  });

  it("refuses an order above the ceiling of one payment", async () => {
    const s = setup();
    s.store.stock.set(
      PISTA,
      stockRow({ id: PISTA, name: "Pista", priceCents: 10_000_000, maxPerOrder: 20 }),
    );
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 10 }])),
    ).rejects.toMatchObject({ constructor: InvalidOrderError, path: "items" });
  });

  it("does not find drafts nor unknown events", async () => {
    const s = setup();
    s.store.events.set(EVENT, { ...s.eventRow(), status: "DRAFT" });
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 1 }])),
    ).rejects.toThrow(EventNotFoundError);
    await expect(
      s.create.execute(
        ana,
        key(2),
        order([{ ticketTypeId: PISTA, quantity: 1 }], "0192a0e4-0000-7000-8000-0000000e0404"),
      ),
    ).rejects.toThrow(EventNotFoundError);
  });

  it("does not sell a ticket type of another event", async () => {
    const s = setup();
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: ALHEIO, quantity: 1 }])),
    ).rejects.toThrow(TicketTypeNotFoundError);
  });

  it("sells nothing of a canceled or ended event", async () => {
    const s = setup();
    s.store.events.set(EVENT, { ...s.eventRow(), status: "CANCELED" });
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 1 }])),
    ).rejects.toMatchObject({
      constructor: SalesClosedError,
      detail: "Este evento foi cancelado.",
    });

    const t = setup();
    t.clock.current = new Date("2026-12-06T03:00:00Z");
    await expect(
      t.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 1 }])),
    ).rejects.toMatchObject({ constructor: SalesClosedError, detail: "Este evento já terminou." });
  });

  it("respects the sales window of each ticket type", async () => {
    const s = setup();
    s.store.stock.set(
      PISTA,
      stockRow({ id: PISTA, name: "Pista", salesStartAt: new Date("2026-11-02T00:00:00Z") }),
    );
    s.store.stock.set(
      CAMAROTE,
      stockRow({ id: CAMAROTE, name: "Camarote", salesEndAt: new Date("2026-11-01T12:00:00Z") }),
    );
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 1 }])),
    ).rejects.toMatchObject({ detail: 'As vendas de "Pista" ainda não começaram.' });
    await expect(
      s.create.execute(ana, key(2), order([{ ticketTypeId: CAMAROTE, quantity: 1 }])),
    ).rejects.toMatchObject({ detail: 'As vendas de "Camarote" estão encerradas.' });
  });

  it("counts the account's orders against its budget", async () => {
    const s = setup();
    for (let i = 0; i < 10; i++) {
      await s.create
        .execute(ana, key(i), order([{ ticketTypeId: ALHEIO, quantity: 1 }]))
        .catch(() => undefined);
    }
    await expect(
      s.create.execute(ana, key(99), order([{ ticketTypeId: PISTA, quantity: 1 }])),
    ).rejects.toThrow(RateLimitExceededError);
    // Another account has its own budget.
    await s.create.execute(bia, key(99), order([{ ticketTypeId: PISTA, quantity: 1 }]));
  });
});

describe("one pending order per buyer and event", () => {
  it("refuses a second order while the first one holds its tickets", async () => {
    const s = setup();
    await s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 1 }]));
    s.advance(9);
    await expect(
      s.create.execute(ana, key(2), order([{ ticketTypeId: CAMAROTE, quantity: 1 }])),
    ).rejects.toThrow(PendingOrderExistsError);
    expect(s.reserved(CAMAROTE)).toBe(0);
    // Other buyers and other events are not affected.
    await s.create.execute(bia, key(3), order([{ ticketTypeId: PISTA, quantity: 1 }]));
    await s.create.execute(
      ana,
      key(4),
      order([{ ticketTypeId: ALHEIO, quantity: 1 }], OTHER_EVENT),
    );
  });

  it("expires a pending order whose time is up and gives its tickets back, once", async () => {
    const s = setup();
    const first = await s.create.execute(
      ana,
      key(1),
      order([{ ticketTypeId: PISTA, quantity: 3 }]),
    );
    s.advance(10);
    const second = await s.create.execute(
      ana,
      key(2),
      order([{ ticketTypeId: PISTA, quantity: 1 }]),
    );
    expect(s.store.orders.get(first.order.id)).toMatchObject({
      status: "EXPIRED",
      expiredAt: s.clock.current,
    });
    expect(second.order.status).toBe("PENDING");
    expect(s.reserved(PISTA)).toBe(1);
  });
});

describe("idempotency", () => {
  it("answers a repeated request with the order it made, without holding more", async () => {
    const s = setup();
    const request = order([
      { ticketTypeId: PISTA, quantity: 2 },
      { ticketTypeId: CAMAROTE, quantity: 1 },
    ]);
    const first = await s.create.execute(ana, key(1), request);
    s.advance(1);
    // Same purchase, items in another order and ids in upper case.
    const again = await s.create.execute(ana, key(1), {
      eventId: EVENT.toUpperCase(),
      items: [...request.items]
        .reverse()
        .map((i) => ({ ...i, ticketTypeId: i.ticketTypeId.toUpperCase() })),
    });
    expect(again).toEqual({ order: first.order, replayed: true });
    expect(s.reserved(PISTA)).toBe(2);
    expect(s.store.orders.size).toBe(1);
    expect(s.auditEntries).toHaveLength(1);
  });

  it("refuses the same key with another request", async () => {
    const s = setup();
    await s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 2 }]));
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 3 }])),
    ).rejects.toThrow(IdempotencyKeyReusedError);
  });

  it("keeps keys apart per buyer", async () => {
    const s = setup();
    await s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 2 }]));
    const bias = await s.create.execute(bia, key(1), order([{ ticketTypeId: PISTA, quantity: 3 }]));
    expect(bias.replayed).toBe(false);
    expect(s.reserved(PISTA)).toBe(5);
  });

  it("says the request is in progress while another one holds the key", async () => {
    const s = setup();
    s.store.busyKeys.add(`${ana.id}:${key(1)}`);
    await expect(
      s.create.execute(ana, key(1), order([{ ticketTypeId: PISTA, quantity: 1 }])),
    ).rejects.toThrow(RequestInProgressError);
  });
});

describe("reading an order", () => {
  it("shows the buyer their order and nobody else", async () => {
    const s = setup();
    const { order: created } = await s.create.execute(
      ana,
      key(1),
      order([{ ticketTypeId: PISTA, quantity: 1 }]),
    );
    await expect(s.get.execute(ana, created.id)).resolves.toEqual(created);
    await expect(s.get.execute(bia, created.id)).rejects.toThrow(OrderNotFoundError);
  });
});
