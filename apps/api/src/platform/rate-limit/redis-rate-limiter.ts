import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { RedisService } from "../redis/redis.module.js";
import type { RateLimiter, RateLimitResult, RateLimitRule } from "./rate-limiter.js";

/**
 * Fixed-window counters in Redis: one `INCR` per hit, with the expiry set when the
 * window opens. The three commands run in one MULTI/EXEC, so a crash between them
 * cannot leave a counter that never expires.
 *
 * When Redis is down the limiter lets the request through and says so in the log:
 * the account lockout in the database still stops password guessing, and refusing
 * every login while a cache is unavailable would turn an outage into a lockout of
 * everyone (docs/SECURITY_MODEL.md).
 */
@Injectable()
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: RedisService,
    @InjectPinoLogger(RedisRateLimiter.name) private readonly logger: PinoLogger,
  ) {}

  async hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    const key = `rl:${rule.name}:${createHash("sha256").update(subject).digest("hex")}`;
    const windowMs = rule.windowSeconds * 1000;

    try {
      if (this.redis.status === "wait") await this.redis.connect();
      const replies = await this.redis
        .multi()
        .incr(key)
        .pexpire(key, windowMs, "NX")
        .pttl(key)
        .exec();
      const count = Number(replies?.[0]?.[1]);
      let ttlMs = Number(replies?.[2]?.[1]);
      if (!Number.isFinite(count)) throw new Error("Unexpected reply from Redis");
      if (!Number.isFinite(ttlMs) || ttlMs < 0) {
        // A counter without an expiry would block the subject forever: repair it.
        await this.redis.pexpire(key, windowMs);
        ttlMs = windowMs;
      }

      return {
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        resetSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      };
    } catch (error) {
      this.logger.warn(
        { err: error, rule: rule.name },
        "Rate limiter unavailable; allowing request",
      );
      return {
        allowed: true,
        limit: rule.limit,
        remaining: rule.limit,
        resetSeconds: rule.windowSeconds,
      };
    }
  }
}
