import type {
  TransactionContext,
  TransactionRunner,
} from "../../../platform/database/transaction.js";
import type { Order, OrderEvent } from "../domain/order.js";
import type { SaleEvent } from "../domain/reservation-policy.js";
import type { Inventory, Reservation } from "./ports/inventory.js";
import type { HeldTickets, NewOrder, OrderRepository } from "./ports/order-repository.js";

export interface StockRow {
  readonly id: string;
  readonly eventId: string;
  readonly name: string;
  readonly priceCents: number;
  readonly capacity: number;
  sold: number;
  reserved: number;
  readonly maxPerOrder: number;
  readonly salesStartAt: Date | null;
  readonly salesEndAt: Date | null;
}

export interface EventRow extends OrderEvent {
  readonly status: "DRAFT" | "PUBLISHED" | "CANCELED";
}

type OrderRow = NewOrder & {
  status: Order["status"];
  expiredAt: Date | null;
};

/**
 * Orders and the stock they hold, in memory, with the conditional writes of the real
 * ones. Its transaction runner restores everything when the work throws, like a rollback.
 */
export class InMemoryOrderStore implements OrderRepository, Inventory, TransactionRunner {
  events = new Map<string, EventRow>();
  stock = new Map<string, StockRow>();
  orders = new Map<string, OrderRow>();
  /** Idempotency keys another request is holding. */
  readonly busyKeys = new Set<string>();
  /** Ticket types in the order `reserve` was called. */
  readonly reserveCalls: string[] = [];

  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({ e: this.events, s: this.stock, o: this.orders });
    try {
      return await work({} as TransactionContext);
    } catch (error) {
      this.events = snapshot.e;
      this.stock = snapshot.s;
      this.orders = snapshot.o;
      throw error;
    }
  }

  lockIdempotencyKey(buyerId: string, key: string): Promise<boolean> {
    return Promise.resolve(!this.busyKeys.has(`${buyerId}:${key}`));
  }

  findByIdempotencyKey(buyerId: string, key: string) {
    const row = [...this.orders.values()].find(
      (o) => o.buyerId === buyerId && o.idempotencyKey === key,
    );
    return Promise.resolve(row ? { id: row.id, requestHash: row.requestHash } : null);
  }

  findPending(buyerId: string, eventId: string) {
    const row = [...this.orders.values()].find(
      (o) => o.buyerId === buyerId && o.eventId === eventId && o.status === "PENDING",
    );
    return Promise.resolve(row ? { id: row.id, expiresAt: row.expiresAt } : null);
  }

  insert(order: NewOrder): Promise<"created" | "pending-exists" | "code-taken"> {
    const rows = [...this.orders.values()];
    if (rows.some((o) => o.publicCode === order.publicCode)) return Promise.resolve("code-taken");
    if (
      rows.some(
        (o) => o.buyerId === order.buyerId && o.eventId === order.eventId && o.status === "PENDING",
      )
    ) {
      return Promise.resolve("pending-exists");
    }
    this.orders.set(order.id, { ...order, status: "PENDING", expiredAt: null });
    return Promise.resolve("created");
  }

  markExpired(orderId: string, now: Date): Promise<HeldTickets[] | null> {
    const row = this.orders.get(orderId);
    if (row?.status !== "PENDING" || row.expiresAt > now) return Promise.resolve(null);
    row.status = "EXPIRED";
    row.expiredAt = now;
    return Promise.resolve(
      row.items.map(({ ticketTypeId, quantity }) => ({ ticketTypeId, quantity })),
    );
  }

  findOwned(orderId: string, buyerId: string): Promise<Order | null> {
    const row = this.orders.get(orderId);
    const event = row && this.events.get(row.eventId);
    if (row?.buyerId !== buyerId || !event) return Promise.resolve(null);
    const { status: _status, ...eventFields } = event;
    return Promise.resolve({
      id: row.id,
      publicCode: row.publicCode,
      buyerId: row.buyerId,
      status: row.status,
      event: eventFields,
      items: row.items.map((item) => ({
        ...item,
        name: this.stock.get(item.ticketTypeId)?.name ?? "?",
      })),
      totalCents: row.totalCents,
      expiresAt: row.expiresAt,
      extensionCount: 0,
      createdAt: row.createdAt,
      paidAt: null,
    });
  }

  findEventForSale(eventId: string): Promise<SaleEvent | null> {
    const event = this.events.get(eventId);
    if (!event || event.status === "DRAFT") return Promise.resolve(null);
    return Promise.resolve({
      id: event.id,
      status: event.status,
      endsAt: event.endsAt,
      ticketTypes: [...this.stock.values()].filter((t) => t.eventId === eventId),
    });
  }

  reserve(ticketTypeId: string, quantity: number): Promise<Reservation> {
    this.reserveCalls.push(ticketTypeId);
    const row = this.stock.get(ticketTypeId);
    if (!row) throw new Error("unknown ticket type");
    if (row.sold + row.reserved + quantity > row.capacity) {
      return Promise.resolve({
        reserved: false,
        available: row.capacity - row.sold - row.reserved,
      });
    }
    row.reserved += quantity;
    return Promise.resolve({ reserved: true, unitPriceCents: row.priceCents });
  }

  release(ticketTypeId: string, quantity: number): Promise<void> {
    const row = this.stock.get(ticketTypeId);
    if (!row || row.reserved < quantity) throw new Error("releasing more than held");
    row.reserved -= quantity;
    return Promise.resolve();
  }
}
