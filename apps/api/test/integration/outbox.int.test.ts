import { outboxJobDataSchema } from "@vira/shared";
import { Redis } from "ioredis";
import { Worker } from "bullmq";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DispatchOutbox } from "../../src/modules/outbox/application/dispatch-outbox.js";
import { MESSAGE_PUBLISHER } from "../../src/modules/outbox/application/ports/message-publisher.js";
import { PurgeOutbox } from "../../src/modules/outbox/application/purge-outbox.js";
import { Outbox } from "../../src/modules/outbox/application/public-api.js";
import { BullMqMessagePublisher } from "../../src/modules/outbox/infra/bullmq-message-publisher.js";
import { OutboxDispatcherModule } from "../../src/modules/outbox/outbox.module.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../src/platform/database/transaction.js";
import { QueueModule, QueueService } from "../../src/platform/queue/queue.module.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { v7 as uuidv7 } from "uuid";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

/** A clock the tests move by hand. */
const clock = { current: new Date("2026-10-08T12:00:00Z"), now: () => clock.current };

/** Wraps the real publisher: records deliveries and can be told to fail. */
class RecordingPublisher {
  failWith: Error | undefined;
  readonly published: string[] = [];
  constructor(private readonly inner: BullMqMessagePublisher) {}

  async publish(message: Parameters<BullMqMessagePublisher["publish"]>[0]): Promise<void> {
    if (this.failWith) throw this.failWith;
    await this.inner.publish(message);
    this.published.push(message.id);
  }
}

describe.skipIf(!dockerAvailable)("transactional outbox (PostgreSQL + Redis)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  let outbox: Outbox;
  let dispatch: DispatchOutbox;
  let transactions: TransactionRunner;
  let publisher: RecordingPublisher;
  let queues: QueueService;

  const newOrderId = () => uuidv7();
  const rowFor = (orderId: string) =>
    prisma.outboxMessage.findFirst({ where: { payload: { path: ["orderId"], equals: orderId } } });

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: { DATABASE_URL: infrastructure.databaseUrl, REDIS_URL: infrastructure.redisUrl },
      imports: [QueueModule, OutboxDispatcherModule],
      override: (builder) =>
        builder
          .overrideProvider(CLOCK)
          .useValue(clock)
          .overrideProvider(MESSAGE_PUBLISHER)
          .useFactory({
            inject: [QueueService],
            factory: (service: QueueService) =>
              new RecordingPublisher(new BullMqMessagePublisher(service)),
          }),
    });
    prisma = testApp.app.get(PrismaService);
    outbox = testApp.app.get(Outbox);
    dispatch = testApp.app.get(DispatchOutbox);
    transactions = testApp.app.get<TransactionRunner>(TRANSACTION_RUNNER);
    publisher = testApp.app.get<RecordingPublisher>(MESSAGE_PUBLISHER);
    queues = testApp.app.get(QueueService);
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("dispatches a committed message to its queue exactly once", async () => {
    const orderId = newOrderId();
    await transactions.run((tx) =>
      outbox.publish({ type: "orders.paid", payload: { orderId } }, tx),
    );

    expect(await dispatch.execute()).toEqual({ dispatched: 1, failed: 0 });

    const row = await rowFor(orderId);
    expect(row).toMatchObject({ attempts: 1, lastError: null });
    expect(row?.dispatchedAt).toEqual(clock.current);

    const job = await queues.queue("tickets").getJob(row?.id ?? "");
    expect(job?.name).toBe("orders.paid");
    expect(outboxJobDataSchema.parse(job?.data)).toEqual({
      messageId: row?.id,
      type: "orders.paid",
      payload: { orderId },
    });

    // Nothing left to do: a second round publishes nothing.
    expect(await dispatch.execute()).toEqual({ dispatched: 0, failed: 0 });
    expect(publisher.published.filter((id) => id === row?.id)).toHaveLength(1);
  });

  it("never creates a message when the transaction rolls back", async () => {
    const orderId = newOrderId();
    const before = await prisma.outboxMessage.count();

    await expect(
      transactions.run(async (tx) => {
        await outbox.publish({ type: "orders.paid", payload: { orderId } }, tx);
        throw new Error("payment could not be recorded");
      }),
    ).rejects.toThrow("payment could not be recorded");

    expect(await rowFor(orderId)).toBeNull();
    expect(await prisma.outboxMessage.count()).toBe(before);
    expect(await dispatch.execute()).toEqual({ dispatched: 0, failed: 0 });
  });

  it("rejects a message with an invalid payload before touching the database", async () => {
    const before = await prisma.outboxMessage.count();
    await expect(
      outbox.publish({ type: "orders.paid", payload: { orderId: "not-a-uuid" } }),
    ).rejects.toThrow(/Invalid outbox event/);
    expect(await prisma.outboxMessage.count()).toBe(before);
  });

  it("hands each message to only one of several concurrent dispatchers", async () => {
    const orderIds = Array.from({ length: 6 }, newOrderId);
    for (const orderId of orderIds) {
      await outbox.publish({ type: "tickets.issued", payload: { orderId } });
    }

    const rounds = await Promise.all([dispatch.execute(), dispatch.execute(), dispatch.execute()]);

    expect(rounds.reduce((sum, round) => sum + round.dispatched, 0)).toBe(6);
    for (const orderId of orderIds) {
      const row = await rowFor(orderId);
      expect(row?.attempts).toBe(1);
      expect(publisher.published.filter((id) => id === row?.id)).toHaveLength(1);
    }
  });

  it("retries a failed message later, with exponential backoff", async () => {
    const orderId = newOrderId();
    await outbox.publish({ type: "orders.refund_requested", payload: { orderId } });

    publisher.failWith = new Error("redis\nunavailable");
    expect(await dispatch.execute()).toEqual({ dispatched: 0, failed: 1 });
    const failed = await rowFor(orderId);
    expect(failed).toMatchObject({
      attempts: 1,
      dispatchedAt: null,
      lastError: "Error: redis unavailable",
    });
    expect(failed?.availableAt).toEqual(new Date(clock.current.getTime() + 5_000));

    // Not due yet, even though the dependency is back.
    publisher.failWith = undefined;
    expect(await dispatch.execute()).toEqual({ dispatched: 0, failed: 0 });

    clock.current = new Date(clock.current.getTime() + 6_000);
    expect(await dispatch.execute()).toEqual({ dispatched: 1, failed: 0 });
    const delivered = await rowFor(orderId);
    expect(delivered).toMatchObject({ attempts: 2, lastError: null });
    expect(delivered?.dispatchedAt).toEqual(clock.current);
    expect(await queues.queue("payments").getJob(delivered?.id ?? "")).toBeDefined();
  });

  it("parks a message that used all its attempts instead of retrying forever", async () => {
    const orderId = newOrderId();
    await prisma.outboxMessage.create({
      data: {
        id: uuidv7(),
        type: "orders.paid",
        payload: { orderId },
        createdAt: new Date("2026-10-01T00:00:00Z"),
        availableAt: new Date("2026-10-01T00:00:00Z"),
        attempts: 10,
        lastError: "Error: gave up",
      },
    });

    expect(await dispatch.execute()).toEqual({ dispatched: 0, failed: 0 });
    expect(await rowFor(orderId)).toMatchObject({ attempts: 10, dispatchedAt: null });
  });

  it("purges delivered messages after the retention period only", async () => {
    const [oldId, recentId] = [newOrderId(), newOrderId()];
    const delivered = (orderId: string, daysAgo: number) =>
      prisma.outboxMessage.create({
        data: {
          id: uuidv7(),
          type: "tickets.issued",
          payload: { orderId },
          createdAt: new Date(clock.current.getTime() - (daysAgo + 1) * 86_400_000),
          availableAt: new Date(clock.current.getTime() - (daysAgo + 1) * 86_400_000),
          dispatchedAt: new Date(clock.current.getTime() - daysAgo * 86_400_000),
          attempts: 1,
        },
      });
    await delivered(oldId, 8);
    await delivered(recentId, 1);

    expect(await testApp.app.get(PurgeOutbox).execute()).toBe(1);
    expect(await rowFor(oldId)).toBeNull();
    expect(await rowFor(recentId)).not.toBeNull();
  });

  it("enforces the message shape in the database", async () => {
    const base = {
      payload: {},
      createdAt: clock.current,
      availableAt: clock.current,
    };
    await expect(
      prisma.outboxMessage.create({ data: { ...base, id: uuidv7(), type: "Not A Type" } }),
    ).rejects.toThrow(/outbox_messages_type_format/);
    await expect(
      prisma.outboxMessage.create({
        data: { ...base, id: uuidv7(), type: "orders.paid", payload: [] },
      }),
    ).rejects.toThrow(/outbox_messages_payload_is_object/);
    await expect(
      prisma.outboxMessage.create({
        data: { ...base, id: uuidv7(), type: "orders.paid", dispatchedAt: clock.current },
      }),
    ).rejects.toThrow(/outbox_messages_dispatched_after_attempt/);
  });

  it("delivers jobs to a queue consumer", async () => {
    const orderId = newOrderId();
    const connection = new Redis(infrastructure.redisUrl, { maxRetriesPerRequest: null });
    let receive: (data: unknown) => void = () => undefined;
    const received = new Promise<unknown>((resolve) => {
      receive = resolve;
    });
    const worker = new Worker(
      "email",
      (job) => {
        const payload = (job.data as { payload?: { orderId?: string } }).payload;
        if (payload?.orderId === orderId) receive(job.data);
        return Promise.resolve();
      },
      { connection },
    );
    worker.on("error", () => undefined);

    try {
      await outbox.publish({ type: "tickets.issued", payload: { orderId } });
      await dispatch.execute();

      const data = outboxJobDataSchema.parse(
        await Promise.race([
          received,
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              reject(new Error("no job received"));
            }, 15_000),
          ),
        ]),
      );
      expect(data).toMatchObject({ type: "tickets.issued", payload: { orderId } });
    } finally {
      await worker.close();
      connection.disconnect();
    }
  });
});
