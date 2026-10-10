import { OUTBOX_CATALOG, type OutboxPayload, type OutboxType } from "./outbox-catalog.js";

/** A side effect to record, typed by message type so the payload always matches the catalog. */
export type OutboxEvent = {
  [T in OutboxType]: { readonly type: T; readonly payload: OutboxPayload<T> };
}[OutboxType];

export interface OutboxMessage {
  readonly id: string;
  readonly type: OutboxType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  /** Dispatch attempts made so far. */
  readonly attempts: number;
}

export class InvalidOutboxEventError extends Error {
  constructor(
    readonly type: string,
    readonly problems: readonly string[],
  ) {
    super(`Invalid outbox event "${type}": ${problems.join("; ")}`);
    this.name = "InvalidOutboxEventError";
  }
}

/** Builds a validated, immutable message that has not been dispatched yet. */
export function buildOutboxMessage(
  event: OutboxEvent,
  stamp: { readonly id: string; readonly createdAt: Date },
): OutboxMessage {
  const parsed = OUTBOX_CATALOG[event.type].payload.safeParse(event.payload, {
    reportInput: false,
  });
  if (!parsed.success) {
    throw new InvalidOutboxEventError(
      event.type,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`),
    );
  }

  return Object.freeze({
    id: stamp.id,
    type: event.type,
    payload: Object.freeze({ ...parsed.data }),
    createdAt: stamp.createdAt,
    attempts: 0,
  });
}
