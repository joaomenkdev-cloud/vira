import { Injectable } from "@nestjs/common";
import type { OutboxJobData } from "@vira/shared";

import { QueueService } from "../../../platform/queue/queue.module.js";
import type { MessagePublisher } from "../application/ports/message-publisher.js";
import { queueFor } from "../domain/outbox-catalog.js";
import type { OutboxMessage } from "../domain/outbox-message.js";

/** Finished jobs are kept for a day so a re-publish of the same message stays deduplicated. */
const KEEP_COMPLETED_FOR_SECONDS = 24 * 60 * 60;
const KEEP_FAILED_FOR_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class BullMqMessagePublisher implements MessagePublisher {
  constructor(private readonly queues: QueueService) {}

  async publish(message: OutboxMessage): Promise<void> {
    const data: OutboxJobData = {
      messageId: message.id,
      type: message.type,
      payload: { ...message.payload },
    };

    // The message id is the job id: adding it again (e.g. after a crash between
    // publishing and recording the delivery) does not create a second job.
    await this.queues.withTimeout(
      this.queues.queue(queueFor(message.type)).add(message.type, data, {
        jobId: message.id,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { age: KEEP_COMPLETED_FOR_SECONDS },
        removeOnFail: { age: KEEP_FAILED_FOR_SECONDS },
      }),
    );
  }
}
