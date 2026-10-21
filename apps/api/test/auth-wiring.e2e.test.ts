import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { WorkerModule } from "../src/bootstrap/worker.module.js";
import { loadConfig } from "../src/platform/config/load-config.js";
import { JobHandlerRegistry } from "../src/platform/queue/job-handlers.js";
import { QueueConsumers } from "../src/platform/queue/queue-consumers.js";
import {
  createTestApp,
  TEST_SECRETS,
  TEST_WEB_ORIGIN,
  UNREACHABLE_INFRASTRUCTURE,
} from "./support/create-test-app.js";

const AUTH_MESSAGES = ["auth.verification_email_requested", "auth.account_exists_notice"];

// These boot without PostgreSQL, Redis or a mail server (connections are lazy, and the
// workers that would block on Redis are switched off): they check that the modules are
// wired, not that the infrastructure works. The integration suites check the latter.
const withoutWorkers = (builder: TestingModuleBuilder) =>
  builder.overrideProvider(QueueConsumers).useValue({ onApplicationBootstrap: () => undefined });

describe("who consumes the authentication e-mail messages", () => {
  it("the API process does so only in embedded mode", async () => {
    const separate = await createTestApp({
      env: { WORKER_MODE: "separate" },
      override: withoutWorkers,
    });
    const embedded = await createTestApp({
      env: { WORKER_MODE: "embedded" },
      override: withoutWorkers,
    });
    try {
      // In separate mode the queue consumers are not part of the API at all.
      expect(() => separate.app.get(JobHandlerRegistry)).toThrow();

      const registry = embedded.app.get(JobHandlerRegistry);
      for (const type of AUTH_MESSAGES) expect(registry.find("email", type)).toBeDefined();
      expect(registry.queues()).toEqual(["email", "orders", "payments"]);
    } finally {
      await separate.app.close();
      await embedded.app.close();
    }
  });

  it("the standalone worker always does", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      WEB_ORIGIN: TEST_WEB_ORIGIN,
      LOG_LEVEL: "silent",
      ...UNREACHABLE_INFRASTRUCTURE,
      ...TEST_SECRETS,
    });
    const worker = await withoutWorkers(
      Test.createTestingModule({ imports: [WorkerModule.register({ config })] }),
    ).compile();
    await worker.init();
    try {
      const registry = worker.get(JobHandlerRegistry);
      for (const type of AUTH_MESSAGES) expect(registry.find("email", type)).toBeDefined();
    } finally {
      await worker.close();
    }
  });
});
