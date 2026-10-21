import { Injectable, type OnModuleInit } from "@nestjs/common";

import { JobHandlerRegistry } from "../../../platform/queue/job-handlers.js";
import { ExpireOrder } from "../application/expire-order.js";
import { EXPIRE_ORDER_JOB, expireOrderPayloadSchema, ORDERS_QUEUE } from "./expire-order-job.js";

/**
 * Connects the delayed expirations to their use case. A job that throws (the database
 * down) is retried by BullMQ; one that finds the order paid, canceled, extended or already
 * expired simply completes.
 */
@Injectable()
export class OrdersJobHandlers implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly expireOrder: ExpireOrder,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: ORDERS_QUEUE,
      type: EXPIRE_ORDER_JOB,
      handle: async (data) => {
        const { orderId } = expireOrderPayloadSchema.parse(data.payload, { reportInput: false });
        await this.expireOrder.execute(orderId);
      },
    });
  }
}
