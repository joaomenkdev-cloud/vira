import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { ExpireOrder } from "./expire-order.js";
import { ORDER_REPOSITORY, type OrderRepository } from "./ports/order-repository.js";

/** Orders looked at per query. */
const BATCH_SIZE = 100;
/** Queries per sweep: whatever is left waits for the next one, a minute later. */
const MAX_BATCHES = 10;

/**
 * The safety net of the expiration (ADR-0007): expires every pending order whose time is
 * up and whose job was lost (Redis restarted, the job never scheduled). Several sweeps may
 * run at once: each order is expired by its conditional transition, only once.
 */
@Injectable()
export class SweepExpiredOrders {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly expireOrder: ExpireOrder,
  ) {}

  /** Answers how many orders this sweep expired. */
  async execute(): Promise<number> {
    let expired = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const due = await this.orders.findOverdue(this.clock.now(), BATCH_SIZE);
      for (const orderId of due) {
        if (await this.expireOrder.execute(orderId)) expired++;
      }
      if (due.length < BATCH_SIZE) break;
    }
    return expired;
  }
}
