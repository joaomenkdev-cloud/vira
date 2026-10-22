import { createHash, randomInt } from "node:crypto";

import type { CreateOrderRequest, OrderStatus } from "@vira/shared";

/** The event an order is for, as the order shows it. */
export interface OrderEvent {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
}

/** One line of an order: a ticket type, how many, and its price when reserved. */
export interface OrderItem {
  readonly id: string;
  readonly ticketTypeId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceCents: number;
  /** One per ticket once the buyer gave them (V6); empty until then. */
  readonly holderNames: readonly string[];
}

/** An order as its buyer sees it (docs/DATA_MODEL.md#orders). */
export interface Order {
  readonly id: string;
  readonly publicCode: string;
  readonly buyerId: string;
  readonly status: OrderStatus;
  readonly event: OrderEvent;
  readonly items: readonly OrderItem[];
  readonly totalCents: number;
  readonly expiresAt: Date;
  readonly extensionCount: number;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
  /** Its Stripe PaymentIntent, once payment started (never shown to the buyer as such). */
  readonly paymentIntentId: string | null;
}

/** Every line names the holder of each of its tickets: the order can be paid. */
export function holdersComplete(order: Pick<Order, "items">): boolean {
  return order.items.every((item) => item.holderNames.length === item.quantity);
}

export function subtotalCents(item: Pick<OrderItem, "quantity" | "unitPriceCents">): number {
  return item.quantity * item.unitPriceCents;
}

export function totalCents(
  items: readonly Pick<OrderItem, "quantity" | "unitPriceCents">[],
): number {
  return items.reduce((sum, item) => sum + subtotalCents(item), 0);
}

/**
 * The single extension (+10 min) is still there to use. It can be asked for only in the
 * last 2 minutes (`extensionRefusal`); the client shows the button then.
 */
export function extensionAvailable(order: Pick<Order, "status" | "extensionCount">): boolean {
  return order.status === "PENDING" && order.extensionCount === 0;
}

/**
 * SHA-256 of the request in a canonical form: the same purchase hashes the same whatever
 * the order of its items or the case of its ids, so a retry is recognized as such.
 */
export function requestHash(request: CreateOrderRequest): Buffer {
  const items = request.items
    .map((item) => ({ ticketTypeId: item.ticketTypeId.toLowerCase(), quantity: item.quantity }))
    .sort((a, b) => (a.ticketTypeId < b.ticketTypeId ? -1 : 1));
  const canonical = JSON.stringify({ eventId: request.eventId.toLowerCase(), items });
  return createHash("sha256").update(canonical).digest();
}

/** Crockford Base32: no I, L, O or U, so a code read aloud is not misheard. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `VIRA-ORD-XXXX-XXXX`, random (40 bits): a reference for support, never a credential. */
export function newPublicCode(): string {
  const group = () => Array.from({ length: 4 }, () => CROCKFORD[randomInt(32)]).join("");
  return `VIRA-ORD-${group()}-${group()}`;
}
