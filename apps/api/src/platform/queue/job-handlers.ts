import { Injectable } from "@nestjs/common";
import type { OutboxJobData, QueueName } from "@vira/shared";

/** Consumes one kind of message from a queue (the `type` of the outbox message that created the job). */
export interface JobHandler {
  readonly queue: QueueName;
  readonly type: string;
  handle(data: OutboxJobData): Promise<void>;
}

/**
 * Where modules say which jobs they know how to process. A queue is shared by the
 * messages of several modules (the `email` queue carries sign-up and ticket e-mails),
 * so the worker of a queue routes each job by its type to the module that registered it.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  register(handler: JobHandler): void {
    const key = `${handler.queue}/${handler.type}`;
    if (this.handlers.has(key)) throw new Error(`Job handler already registered for ${key}`);
    this.handlers.set(key, handler);
  }

  find(queue: QueueName, type: string): JobHandler | undefined {
    return this.handlers.get(`${queue}/${type}`);
  }

  /** Queues that have at least one handler: the only ones worth consuming. */
  queues(): QueueName[] {
    return [...new Set([...this.handlers.values()].map((handler) => handler.queue))];
  }
}
