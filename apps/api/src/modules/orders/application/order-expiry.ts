import { Inject, Injectable } from "@nestjs/common";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import { INVENTORY, type Inventory } from "./ports/inventory.js";
import {
  type HeldTickets,
  ORDER_REPOSITORY,
  type OrderRepository,
} from "./ports/order-repository.js";

/**
 * PENDING → EXPIRED, giving the tickets back in the same transaction. The transition is
 * conditional, so whoever gets there first (the delayed job, the sweep, a new order of the
 * same buyer, or the buyer canceling) returns the stock, and only once.
 */
@Injectable()
export class OrderExpiry {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INVENTORY) private readonly inventory: Inventory,
  ) {}

  /** Answers whether this call expired the order. */
  async expireIfOverdue(orderId: string, now: Date, tx: TransactionContext): Promise<boolean> {
    const held = await this.orders.markExpired(orderId, now, tx);
    if (!held) return false;
    await releaseHeld(this.inventory, held, tx);
    return true;
  }
}

/** Gives back what a pending order held, right after the transition that ended it. */
export async function releaseHeld(
  inventory: Inventory,
  held: readonly HeldTickets[],
  tx: TransactionContext,
): Promise<void> {
  // Same order as reservations take their row locks, so the two never deadlock.
  for (const item of [...held].sort(byTicketTypeId)) {
    await inventory.release(item.ticketTypeId, item.quantity, tx);
  }
}

export function byTicketTypeId(
  a: { readonly ticketTypeId: string },
  b: { readonly ticketTypeId: string },
): number {
  if (a.ticketTypeId === b.ticketTypeId) return 0;
  return a.ticketTypeId < b.ticketTypeId ? -1 : 1;
}
