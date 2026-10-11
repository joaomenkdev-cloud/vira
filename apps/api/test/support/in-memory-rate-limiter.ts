import type {
  RateLimiter,
  RateLimitResult,
  RateLimitRule,
} from "../../src/platform/rate-limit/rate-limiter.js";

/** Counts hits per rule and subject without Redis; windows never reset. */
export class InMemoryRateLimiter implements RateLimiter {
  readonly hits: { rule: string; subject: string }[] = [];
  private readonly counters = new Map<string, number>();

  hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    this.hits.push({ rule: rule.name, subject });
    const key = `${rule.name}:${subject}`;
    const count = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, count);
    return Promise.resolve({
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetSeconds: rule.windowSeconds,
    });
  }
}
