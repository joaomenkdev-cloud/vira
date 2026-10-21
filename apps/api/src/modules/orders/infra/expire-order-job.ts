import type { QueueName } from "@vira/shared";
import { z } from "zod";

/** The queue of the delayed expirations; nothing else goes through it. */
export const ORDERS_QUEUE: QueueName = "orders";
export const EXPIRE_ORDER_JOB = "orders.expire";

/** The job carries the order id only; the handler reads the rest from the database. */
export const expireOrderPayloadSchema = z.strictObject({ orderId: z.uuid() });

/** `expire-{orderId}-{end in ms}`: one job per reservation end (BullMQ ids cannot hold `:`). */
export function expireOrderJobId(orderId: string, expiresAt: Date): string {
  return `expire-${orderId}-${expiresAt.getTime()}`;
}
