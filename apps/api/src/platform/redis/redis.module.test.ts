import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config/config.schema.js";
import { RedisService } from "./redis.module.js";

const unreachable = { redis: { url: "redis://127.0.0.1:1" } } as AppConfig;

describe("RedisService.ensureReady", () => {
  it("shares one connection attempt between callers that arrive together", async () => {
    const redis = new RedisService(unreachable);
    const connect = vi.spyOn(redis, "connect");
    try {
      const outcomes = await Promise.allSettled([
        redis.ensureReady(),
        redis.ensureReady(),
        redis.ensureReady(),
      ]);

      expect(outcomes.map((outcome) => outcome.status)).toEqual([
        "rejected",
        "rejected",
        "rejected",
      ]);
      expect(connect).toHaveBeenCalledOnce();
    } finally {
      redis.disconnect();
    }
  });

  it("fails instead of hanging when Redis never becomes ready", async () => {
    const redis = new RedisService(unreachable);
    try {
      await expect(redis.ensureReady(50)).rejects.toThrow();
      // Now reconnecting in the background: the next caller waits, then gives up.
      await expect(redis.ensureReady(50)).rejects.toThrow("Redis is not ready");
    } finally {
      redis.disconnect();
    }
  });
});
