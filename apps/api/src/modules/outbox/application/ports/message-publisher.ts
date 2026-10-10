import type { OutboxMessage } from "../../domain/outbox-message.js";

/**
 * Hands a message to the queue that processes it. Publishing the same message twice
 * must not create two jobs: the message id identifies the job.
 */
export interface MessagePublisher {
  publish(message: OutboxMessage): Promise<void>;
}

export const MESSAGE_PUBLISHER = Symbol("MESSAGE_PUBLISHER");
