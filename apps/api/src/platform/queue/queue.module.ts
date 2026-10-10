import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import type { QueueName } from "@vira/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";

/** Upper bound for talking to Redis: BullMQ otherwise waits for the connection forever. */
export const QUEUE_OPERATION_TIMEOUT_MS = 5_000;

/**
 * The BullMQ queues of the process, over one dedicated Redis connection. It connects
 * on first use, so processes that never enqueue do not hold a connection.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private connection: Redis | undefined;
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  queue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const queue = new Queue(name, { connection: this.getConnection() });
    // Connection errors surface through the operations that use the queue.
    queue.on("error", () => undefined);
    this.queues.set(name, queue);
    return queue;
  }

  /** Runs a queue operation, failing instead of waiting forever while Redis is down. */
  async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Queue operation timed out"));
      }, QUEUE_OPERATION_TIMEOUT_MS);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
    this.connection?.disconnect();
    this.connection = undefined;
  }

  private getConnection(): Redis {
    // BullMQ requires maxRetriesPerRequest to be null on the connections it uses.
    this.connection ??= new Redis(this.config.redis.url, {
      maxRetriesPerRequest: null,
      connectionName: "vira-queues",
    });
    this.connection.on("error", () => undefined);
    return this.connection;
  }
}

@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
