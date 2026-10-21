import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { Order } from "../../domain/order.js";

/** The columns a new order starts with; it is always PENDING, never extended. */
export interface NewOrder {
  readonly id: string;
  readonly publicCode: string;
  readonly buyerId: string;
  readonly eventId: string;
  readonly totalCents: number;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly requestHash: Uint8Array;
  readonly buyerName: string;
  readonly buyerEmail: string;
  readonly createdAt: Date;
  readonly items: readonly NewOrderItem[];
}

export interface NewOrderItem {
  readonly id: string;
  readonly ticketTypeId: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
}

/** What a pending order held, to give it back. */
export interface HeldTickets {
  readonly ticketTypeId: string;
  readonly quantity: number;
}

/**
 * Orders are always reached through their buyer: an order of someone else is simply not
 * found (docs/API.md, OWASP API1 — BOLA).
 */
export interface OrderRepository {
  /**
   * Takes, for the rest of the transaction, the lock of one buyer's idempotency key;
   * `false` when another request with the same key holds it.
   */
  lockIdempotencyKey(buyerId: string, key: string, tx: TransactionContext): Promise<boolean>;

  findByIdempotencyKey(
    buyerId: string,
    key: string,
    tx: TransactionContext,
  ): Promise<{ readonly id: string; readonly requestHash: Uint8Array } | null>;

  /** The buyer's PENDING order for the event, even if its time is up. */
  findPending(
    buyerId: string,
    eventId: string,
    tx: TransactionContext,
  ): Promise<{ readonly id: string; readonly expiresAt: Date } | null>;

  /**
   * Inserts the order and its items, unless the buyer already has a pending order for the
   * event (even one a concurrent request just made) or the public code is taken. Says
   * which, without failing the transaction.
   */
  insert(
    order: NewOrder,
    tx: TransactionContext,
  ): Promise<"created" | "pending-exists" | "code-taken">;

  /**
   * PENDING → EXPIRED if its time is up at `now`; answers what it held, or `null` when it
   * was no longer pending or still has time (another transition won).
   */
  markExpired(orderId: string, now: Date, tx: TransactionContext): Promise<HeldTickets[] | null>;

  /**
   * PENDING → CANCELED for its buyer, whatever time it has left; answers what it held, or
   * `null` when it is not theirs or no longer pending.
   */
  markCanceled(
    orderId: string,
    buyerId: string,
    now: Date,
    tx: TransactionContext,
  ): Promise<HeldTickets[] | null>;

  /**
   * Moves the end of the buyer's reservation from `expiresAt` to `newExpiresAt`, spending
   * its single extension, if it is still pending at `now` and still ends at `expiresAt`
   * (so two concurrent requests extend it once); answers whether it did.
   */
  extend(
    orderId: string,
    buyerId: string,
    expiresAt: Date,
    newExpiresAt: Date,
    now: Date,
    tx?: TransactionContext,
  ): Promise<boolean>;

  /** Records the order's PaymentIntent, unless it already has one. */
  attachPaymentIntent(orderId: string, paymentIntentId: string): Promise<void>;

  /** Pending orders whose time is up at `now`, the most overdue first. */
  findOverdue(now: Date, limit: number): Promise<string[]>;

  findOwned(orderId: string, buyerId: string, tx?: TransactionContext): Promise<Order | null>;
}

export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
