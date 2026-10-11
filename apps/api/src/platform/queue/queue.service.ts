import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { QueueName } from "@vira/shared";
import { type Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";

/** Upper bound for talking to Redis: BullMQ otherwise waits for the connection forever. */
export const QUEUE_OPERATION_TIMEOUT_MS = 5_000;

/** How long shutdown waits for a worker to finish its jobs before giving up on it. */
const WORKER_CLOSE_TIMEOUT_MS = 10_000;

/**
 * Closes a worker, but not at any price: with Redis unreachable BullMQ never finishes
 * closing (nor does `disconnect()`), and a process that is shutting down must not wait for it.
 */
async function closeWithin(worker: Worker, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([worker.close().catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The BullMQ queues of the process, over one dedicated Redis connection. It connects
 * on first use, so processes that never enqueue do not hold a connection.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private connection: Redis | undefined;
  private readonly queues = new Map<QueueName, Queue>();
  private readonly workers: Worker[] = [];

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

  /**
   * Starts consuming `name`. The worker uses its own blocking connection, derived
   * from the shared one, and is closed with the application.
   */
  createWorker(
    name: QueueName,
    processor: (job: Job) => Promise<void>,
    options: { readonly concurrency: number },
  ): Worker {
    const worker = new Worker(name, processor, {
      connection: this.getConnection(),
      concurrency: options.concurrency,
    });
    // Connection errors resolve themselves (BullMQ reconnects); jobs report their own failures.
    worker.on("error", () => undefined);
    this.workers.push(worker);
    return worker;
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
    // Let running jobs finish before the connection they use goes away.
    await Promise.all(this.workers.map((worker) => closeWithin(worker, WORKER_CLOSE_TIMEOUT_MS)));
    this.workers.length = 0;
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
