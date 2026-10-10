import { z } from "zod";

/** Background queues (BullMQ). Each outbox message type is routed to exactly one. */
export const QUEUE_NAMES = ["tickets", "email", "payments"] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Data of every job created by the outbox dispatcher. Consumers validate it with
 * this schema before acting. `payload` holds identifiers only, never personal
 * data: consumers load whatever else they need from the database.
 */
export const outboxJobDataSchema = z.strictObject({
  messageId: z.uuid(),
  type: z.string().regex(/^[a-z]+\.[a-z_]+$/),
  payload: z.record(z.string(), z.unknown()),
});

export type OutboxJobData = z.infer<typeof outboxJobDataSchema>;
