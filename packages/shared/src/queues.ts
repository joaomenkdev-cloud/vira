import { z } from "zod";

/**
 * Background queues (BullMQ). Each outbox message type is routed to exactly one; `orders`
 * carries only the delayed expiration of reservations, scheduled by the orders module.
 */
export const QUEUE_NAMES = ["tickets", "email", "payments", "orders"] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

/**
 * Data of every job: those the outbox dispatcher creates, and the delayed expirations the
 * orders module schedules in the same envelope. Consumers validate it with this schema
 * before acting. `payload` holds identifiers only, never personal
 * data: consumers load whatever else they need from the database.
 */
export const outboxJobDataSchema = z.strictObject({
  messageId: z.uuid(),
  type: z.string().regex(/^[a-z]+\.[a-z_]+$/),
  payload: z.record(z.string(), z.unknown()),
});

export type OutboxJobData = z.infer<typeof outboxJobDataSchema>;
