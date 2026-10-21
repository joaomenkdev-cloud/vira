import { Injectable, type OnModuleInit } from "@nestjs/common";
import { z } from "zod";

import { JobHandlerRegistry } from "../../../platform/queue/job-handlers.js";
import { RefundPayment } from "../application/refund-payment.js";

const refundPayloadSchema = z.strictObject({
  orderId: z.uuid(),
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]+$/),
});

/** Connects the `payments` queue to its use cases: the refunds of payments not honoured. */
@Injectable()
export class PaymentsJobHandlers implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly refund: RefundPayment,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: "payments",
      type: "orders.refund_requested",
      handle: async (data) => {
        const { orderId, paymentIntentId } = refundPayloadSchema.parse(data.payload, {
          reportInput: false,
        });
        await this.refund.execute(orderId, paymentIntentId);
      },
    });
  }
}
