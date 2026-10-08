import type { PinoLogger } from "nestjs-pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import type { DispatchOutbox } from "../application/dispatch-outbox.js";
import type { PurgeOutbox } from "../application/purge-outbox.js";
import { OutboxPoller } from "./outbox-poller.js";

const INTERVAL_MS = 1_000;
const config = { worker: { mode: "separate", outboxPollIntervalMs: INTERVAL_MS } } as AppConfig;

function setup(dispatch: () => Promise<{ dispatched: number; failed: number }>) {
  const execute = vi.fn(dispatch);
  const purge = vi.fn(() => Promise.resolve(0));
  const logger = { info: vi.fn(), error: vi.fn() };
  const poller = new OutboxPoller(
    config,
    { execute } as unknown as DispatchOutbox,
    { execute: purge } as unknown as PurgeOutbox,
    logger as unknown as PinoLogger,
  );
  return { poller, execute, purge, logger };
}

describe("OutboxPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches right away and then on every interval", async () => {
    const { poller, execute } = setup(() => Promise.resolve({ dispatched: 0, failed: 0 }));

    poller.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(execute).toHaveBeenCalledTimes(4);
    poller.onModuleDestroy();
  });

  it("never runs two rounds at once", async () => {
    let release: () => void = () => undefined;
    const { poller, execute } = setup(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ dispatched: 0, failed: 0 });
          };
        }),
    );

    poller.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(execute).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(execute).toHaveBeenCalledTimes(2);
    poller.onModuleDestroy();
  });

  it("logs a failed round and keeps polling", async () => {
    let calls = 0;
    const { poller, execute, logger } = setup(() => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error("database unavailable"))
        : Promise.resolve({ dispatched: 2, failed: 0 });
    });

    poller.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ dispatched: 2, failed: 0 }, "Outbox dispatched");
    poller.onModuleDestroy();
  });

  it("stops polling on shutdown", async () => {
    const { poller, execute } = setup(() => Promise.resolve({ dispatched: 0, failed: 0 }));

    poller.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    poller.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("purges delivered messages once an hour, not on every round", async () => {
    const { poller, purge } = setup(() => Promise.resolve({ dispatched: 0, failed: 0 }));

    poller.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 30);
    expect(purge).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(purge).toHaveBeenCalledTimes(2);
    poller.onModuleDestroy();
  });
});
