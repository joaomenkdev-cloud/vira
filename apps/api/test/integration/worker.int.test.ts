import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkerModule } from "../../src/bootstrap/worker.module.js";
import { Outbox } from "../../src/modules/outbox/application/public-api.js";
import { loadConfig } from "../../src/platform/config/load-config.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const POLL_MS = "100";

/** Polls until `check` returns a value, or fails after `timeoutMs`. */
async function eventually<T>(
  check: () => Promise<T | null | undefined>,
  timeoutMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe.skipIf(!dockerAvailable)("worker modes (PostgreSQL + Redis)", () => {
  let infrastructure: Infrastructure;
  let env: NodeJS.ProcessEnv;
  const apps: TestApp[] = [];

  const dispatched = (prisma: PrismaService, orderId: string) =>
    prisma.outboxMessage.findFirst({
      where: { payload: { path: ["orderId"], equals: orderId }, dispatchedAt: { not: null } },
    });

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    env = {
      DATABASE_URL: infrastructure.databaseUrl,
      REDIS_URL: infrastructure.redisUrl,
      OUTBOX_POLL_INTERVAL_MS: POLL_MS,
    };
  });

  afterAll(async () => {
    await Promise.all(apps.map((testApp) => testApp.app.close()));
    await infrastructure.stop();
  });

  it("dispatches inside the API process when WORKER_MODE=embedded", async () => {
    const testApp = await createTestApp({ env: { ...env, WORKER_MODE: "embedded" } });
    apps.push(testApp);
    const orderId = uuidv7();

    await testApp.app.get(Outbox).publish({ type: "orders.paid", payload: { orderId } });

    const row = await eventually(() => dispatched(testApp.app.get(PrismaService), orderId));
    expect(row.attempts).toBe(1);
  });

  it("leaves dispatching to the worker when WORKER_MODE=separate", async () => {
    const testApp = await createTestApp({ env });
    apps.push(testApp);
    const orderId = uuidv7();

    await testApp.app.get(Outbox).publish({ type: "orders.paid", payload: { orderId } });
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    expect(await dispatched(testApp.app.get(PrismaService), orderId)).toBeNull();
  });

  it("dispatches from the standalone worker process", async () => {
    const api = apps.at(-1);
    if (!api) throw new Error("the previous test must have created an API app");
    const orderId = uuidv7();
    await api.app.get(Outbox).publish({ type: "orders.paid", payload: { orderId } });

    const config = loadConfig({
      NODE_ENV: "test",
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      LOG_LEVEL: "silent",
      ...env,
    });
    const worker = await NestFactory.createApplicationContext(WorkerModule.register({ config }), {
      logger: false,
    });
    try {
      expect(worker.get(Logger)).toBeDefined();
      const row = await eventually(() => dispatched(api.app.get(PrismaService), orderId));
      expect(row.attempts).toBe(1);
    } finally {
      await worker.close();
    }
  });
});
