/**
 * Asks for an order to be expired when its reservation ends (a delayed BullMQ job,
 * ADR-0007). Best effort by design: it never throws, because a job that is lost or never
 * scheduled is caught by the periodic sweep, and the database decides, never the queue.
 */
export interface ExpirationScheduler {
  schedule(orderId: string, expiresAt: Date): Promise<void>;
}

export const EXPIRATION_SCHEDULER = Symbol("EXPIRATION_SCHEDULER");
