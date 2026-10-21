import { Inject, Injectable } from "@nestjs/common";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { OrderExpiry } from "./order-expiry.js";

/**
 * Ends one reservation whose time is up (V2): what the delayed job and the sweep run. Safe
 * to run any number of times, at any moment: an order that was paid, canceled, extended or
 * already expired is left as it is.
 */
@Injectable()
export class ExpireOrder {
  constructor(
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly expiry: OrderExpiry,
    private readonly audit: AuditLog,
  ) {}

  /** Answers whether this call expired the order. */
  async execute(orderId: string): Promise<boolean> {
    const now = this.clock.now();
    const expired = await this.transactions.run((tx) =>
      this.expiry.expireIfOverdue(orderId, now, tx),
    );
    if (expired) {
      await this.audit.record(
        { action: "order.expired", entityId: orderId, metadata: {} },
        { actor: "system" },
      );
    }
    return expired;
  }
}
