import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { type OutboxJobData, outboxJobDataSchema, type QueueName } from "@vira/shared";
import type { Job } from "bullmq";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { JobHandlerRegistry } from "./job-handlers.js";
import { QueueService } from "./queue.service.js";

/** Jobs of one queue processed at the same time by this process. */
const CONCURRENCY = 5;

/** A job reached a worker that has no handler for its type (a deploy skew, or a bug). */
export class UnroutableJobError extends Error {
  constructor(queue: string, type: string) {
    super(`No handler for job type "${type}" on queue "${queue}"`);
    this.name = "UnroutableJobError";
  }
}

/**
 * Consumes every queue that has handlers, once the application is up (handlers are
 * registered while the modules initialize). BullMQ retries a job whose handler throws,
 * with the attempts and backoff the dispatcher set; the logs name the error class and
 * never its message, which may hold personal data.
 */
@Injectable()
export class QueueConsumers implements OnApplicationBootstrap {
  constructor(
    private readonly queues: QueueService,
    private readonly registry: JobHandlerRegistry,
    @InjectPinoLogger(QueueConsumers.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    for (const name of this.registry.queues()) {
      const worker = this.queues.createWorker(name, (job) => this.process(name, job), {
        concurrency: CONCURRENCY,
      });
      worker.on("failed", (job, error) => {
        this.logger.warn(
          {
            queue: name,
            jobId: job?.id,
            type: job?.name,
            attempt: job?.attemptsMade,
            error: error.name,
          },
          "Job failed",
        );
      });
    }
  }

  private async process(queue: QueueName, job: Job): Promise<void> {
    const data: OutboxJobData = outboxJobDataSchema.parse(job.data, { reportInput: false });
    const handler = this.registry.find(queue, data.type);
    if (!handler) throw new UnroutableJobError(queue, data.type);
    await handler.handle(data);
  }
}
