import { describe, expect, it, vi } from "vitest";

import type { RedisService } from "../redis/redis.module.js";
import { RedisRateLimiter } from "./redis-rate-limiter.js";
import { rateLimitHeaders } from "./rate-limiter.js";

const rule = { name: "auth.login.ip", limit: 3, windowSeconds: 900 };

/** Just enough of ioredis to run the limiter's MULTI/EXEC; counts like Redis would. */
class FakeRedis {
  status = "ready";
  failWith: Error | undefined;
  ttlMs: number | undefined = 900_000;
  readonly counters = new Map<string, number>();
  readonly repaired: [string, number][] = [];
  readonly pexpireCalls: unknown[][] = [];

  multi(): unknown {
    const keys: string[] = [];
    const chain = {
      incr: (key: string) => {
        keys.push(key);
        return chain;
      },
      pexpire: (...args: unknown[]) => {
        this.pexpireCalls.push(args);
        return chain;
      },
      pttl: () => chain,
      exec: () => {
        if (this.failWith) return Promise.reject(this.failWith);
        const key = keys[0] ?? "";
        const count = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, count);
        return Promise.resolve([
          [null, count],
          [null, 1],
          [null, this.ttlMs ?? -1],
        ]);
      },
    };
    return chain;
  }

  pexpire(key: string, ms: number): Promise<number> {
    this.repaired.push([key, ms]);
    return Promise.resolve(1);
  }

  ensureReady(): Promise<void> {
    this.status = "ready";
    return Promise.resolve();
  }
}

function create(): { limiter: RedisRateLimiter; redis: FakeRedis; warn: ReturnType<typeof vi.fn> } {
  const redis = new FakeRedis();
  const warn = vi.fn();
  const limiter = new RedisRateLimiter(redis as unknown as RedisService, { warn } as never);
  return { limiter, redis, warn };
}

describe("RedisRateLimiter", () => {
  it("allows hits up to the limit and counts what is left", async () => {
    const { limiter } = create();

    const results = [];
    for (let i = 0; i < 3; i++) results.push(await limiter.hit(rule, "203.0.113.7"));

    expect(results.map((r) => r.allowed)).toEqual([true, true, true]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0]);
    expect(results[0]).toMatchObject({ limit: 3, resetSeconds: 900 });
  });

  it("refuses the hit after the limit and reports when the window ends", async () => {
    const { limiter, redis } = create();
    for (let i = 0; i < 3; i++) await limiter.hit(rule, "203.0.113.7");
    redis.ttlMs = 41_200;

    const refused = await limiter.hit(rule, "203.0.113.7");

    expect(refused).toEqual({ allowed: false, limit: 3, remaining: 0, resetSeconds: 42 });
    expect(rateLimitHeaders(refused)).toEqual({
      "RateLimit-Limit": "3",
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": "42",
      "Retry-After": "42",
    });
  });

  it("keeps a separate budget per subject and per rule", async () => {
    const { limiter } = create();
    for (let i = 0; i < 3; i++) await limiter.hit(rule, "203.0.113.7");

    expect((await limiter.hit(rule, "203.0.113.7")).allowed).toBe(false);
    expect((await limiter.hit(rule, "198.51.100.9")).allowed).toBe(true);
    expect((await limiter.hit({ ...rule, name: "auth.register.ip" }, "203.0.113.7")).allowed).toBe(
      true,
    );
  });

  it("never stores the subject in Redis, only its hash", async () => {
    const { limiter, redis } = create();

    await limiter.hit(rule, "ana@exemplo.com");

    const [key] = [...redis.counters.keys()];
    expect(key).toMatch(/^rl:auth\.login\.ip:[0-9a-f]{64}$/);
    expect(key).not.toContain("ana");
  });

  it("sets the expiry only when the window opens (NX)", async () => {
    const { limiter, redis } = create();

    await limiter.hit(rule, "203.0.113.7");

    expect(redis.pexpireCalls).toEqual([[expect.any(String), 900_000, "NX"]]);
  });

  it("repairs a counter that has no expiry instead of blocking forever", async () => {
    const { limiter, redis } = create();
    redis.ttlMs = undefined;

    const result = await limiter.hit(rule, "203.0.113.7");

    expect(redis.repaired).toEqual([[expect.any(String), 900_000]]);
    expect(result.resetSeconds).toBe(900);
  });

  it("lets the request through, and logs it, when Redis is down", async () => {
    const { limiter, redis, warn } = create();
    redis.failWith = new Error("ECONNREFUSED");

    const result = await limiter.hit(rule, "203.0.113.7");

    expect(result).toEqual({ allowed: true, limit: 3, remaining: 3, resetSeconds: 900 });
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("203.0.113.7");
  });
});
