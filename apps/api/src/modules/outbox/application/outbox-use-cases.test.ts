import { describe, expect, it } from "vitest";

import { InvalidOutboxEventError, type OutboxMessage } from "../domain/outbox-message.js";
import { DISPATCHED_RETENTION_MS } from "../domain/retry-policy.js";
import { DispatchOutbox } from "./dispatch-outbox.js";
import { Outbox } from "./outbox.js";
import type { MessagePublisher } from "./ports/message-publisher.js";
import type { DispatchOutcome, OutboxRepository } from "./ports/outbox-repository.js";
import { PurgeOutbox } from "./purge-outbox.js";

const now = new Date("2026-10-08T12:00:00Z");
const clock = { now: () => now };
const orderId = "0192a0e4-0000-7000-8000-0000000000bb";
const tx = {} as never;

class InMemoryOutboxRepository implements OutboxRepository {
  readonly messages: OutboxMessage[] = [];
  readonly outcomes: DispatchOutcome[] = [];
  readonly appendedIn: unknown[] = [];
  purgedBefore: Date | undefined;

  append(message: OutboxMessage, transaction?: never): Promise<void> {
    this.messages.push(message);
    this.appendedIn.push(transaction);
    return Promise.resolve();
  }

  async processDue(
    _limit: number,
    _now: Date,
    process: (batch: readonly OutboxMessage[]) => Promise<readonly DispatchOutcome[]>,
  ): Promise<void> {
    this.outcomes.push(...(await process(this.messages)));
  }

  purgeDispatchedBefore(cutoff: Date): Promise<number> {
    this.purgedBefore = cutoff;
    return Promise.resolve(3);
  }
}

function ids(): { next(): string } {
  let n = 0;
  return { next: () => `0192a0e4-0000-7000-8000-${String(++n).padStart(12, "0")}` };
}

describe("Outbox", () => {
  it("records a validated message in the given transaction", async () => {
    const repository = new InMemoryOutboxRepository();
    const outbox = new Outbox(repository, clock, ids());

    await outbox.publish({ type: "orders.paid", payload: { orderId } }, tx);

    expect(repository.messages).toEqual([
      {
        id: "0192a0e4-0000-7000-8000-000000000001",
        type: "orders.paid",
        payload: { orderId },
        createdAt: now,
        attempts: 0,
      },
    ]);
    expect(repository.appendedIn).toEqual([tx]);
  });

  it("stores nothing when the payload is invalid", async () => {
    const repository = new InMemoryOutboxRepository();
    const outbox = new Outbox(repository, clock, ids());

    await expect(
      outbox.publish({ type: "orders.paid", payload: { orderId: "nope" } }),
    ).rejects.toBeInstanceOf(InvalidOutboxEventError);
    expect(repository.messages).toEqual([]);
  });
});

describe("DispatchOutbox", () => {
  async function seed(count: number): Promise<InMemoryOutboxRepository> {
    const repository = new InMemoryOutboxRepository();
    const outbox = new Outbox(repository, clock, ids());
    for (let i = 0; i < count; i++) {
      await outbox.publish({ type: "orders.paid", payload: { orderId } });
    }
    return repository;
  }

  it("publishes every message of the batch", async () => {
    const repository = await seed(2);
    const published: string[] = [];
    const publisher: MessagePublisher = {
      publish: (message) => {
        published.push(message.id);
        return Promise.resolve();
      },
    };

    const summary = await new DispatchOutbox(repository, publisher, clock).execute();

    expect(summary).toEqual({ dispatched: 2, failed: 0 });
    expect(published).toEqual(repository.messages.map((m) => m.id));
    expect(repository.outcomes.every((o) => o.error === undefined)).toBe(true);
  });

  it("records a failure and still delivers the other messages", async () => {
    const repository = await seed(3);
    const failing = repository.messages[1]?.id;
    const publisher: MessagePublisher = {
      publish: (message) =>
        message.id === failing
          ? Promise.reject(new Error("redis\nunavailable"))
          : Promise.resolve(),
    };

    const summary = await new DispatchOutbox(repository, publisher, clock).execute();

    expect(summary).toEqual({ dispatched: 2, failed: 1 });
    expect(repository.outcomes.find((o) => o.id === failing)).toEqual({
      id: failing,
      error: "Error: redis unavailable",
    });
  });

  it("does nothing when no message is due", async () => {
    const repository = await seed(0);
    const summary = await new DispatchOutbox(
      repository,
      { publish: () => Promise.reject(new Error("must not be called")) },
      clock,
    ).execute();
    expect(summary).toEqual({ dispatched: 0, failed: 0 });
  });
});

describe("PurgeOutbox", () => {
  it("purges messages delivered before the retention period", async () => {
    const repository = new InMemoryOutboxRepository();
    const purged = await new PurgeOutbox(repository, clock).execute();

    expect(purged).toBe(3);
    expect(repository.purgedBefore).toEqual(new Date(now.getTime() - DISPATCHED_RETENTION_MS));
  });
});
