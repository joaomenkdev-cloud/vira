import { Inject, Injectable } from "@nestjs/common";
import type { OutboxJobData } from "@vira/shared";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { QueueService } from "../../../platform/queue/queue.module.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import type { ExpirationScheduler } from "../application/ports/expiration-scheduler.js";
import { EXPIRE_ORDER_JOB, expireOrderJobId, ORDERS_QUEUE } from "./expire-order-job.js";

const KEEP_COMPLETED_FOR_SECONDS = 24 * 60 * 60;
const KEEP_FAILED_FOR_SECONDS = 7 * 24 * 60 * 60;

/**
 * A delayed job per reservation, due when it ends. The job id names the order and its end,
 * so scheduling the same reservation twice makes one job, and an extended one gets its own.
 */
@Injectable()
export class BullMqExpirationScheduler implements ExpirationScheduler {
  constructor(
    private readonly queues: QueueService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @InjectPinoLogger(BullMqExpirationScheduler.name) private readonly logger: PinoLogger,
  ) {}

  async schedule(orderId: string, expiresAt: Date): Promise<void> {
    // Same envelope as the outbox's jobs, so the queue consumers route it by its type.
    const data: OutboxJobData = {
      messageId: this.ids.next(),
      type: EXPIRE_ORDER_JOB,
      payload: { orderId },
    };
    try {
      await this.queues.withTimeout(
        this.queues.queue(ORDERS_QUEUE).add(EXPIRE_ORDER_JOB, data, {
          jobId: expireOrderJobId(orderId, expiresAt),
          delay: Math.max(0, expiresAt.getTime() - this.clock.now().getTime()),
          attempts: 5,
          backoff: { type: "exponential", delay: 2_000 },
          removeOnComplete: { age: KEEP_COMPLETED_FOR_SECONDS },
          removeOnFail: { age: KEEP_FAILED_FOR_SECONDS },
        }),
      );
    } catch (error) {
      // The sweep expires it within a minute of its end; the order itself is fine.
      this.logger.warn(
        { orderId, error: error instanceof Error ? error.name : "unknown" },
        "Order expiration not scheduled",
      );
    }
  }
}
