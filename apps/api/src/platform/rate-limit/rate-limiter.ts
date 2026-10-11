/** A budget of requests per fixed window, e.g. 5 per hour (docs/API.md, "Rate limit"). */
export interface RateLimitRule {
  /** Namespaces the counter; one name per kind of limit, e.g. `auth.login.ip`. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  /** Hits left in the current window (0 once the limit is reached). */
  readonly remaining: number;
  /** Seconds until the current window ends and the budget is renewed. */
  readonly resetSeconds: number;
}

export interface RateLimiter {
  /**
   * Counts one hit of `subject` (an IP address, an account...) against `rule`. The
   * subject is hashed before it reaches storage, so personal data never sits in Redis.
   */
  hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult>;
}

export const RATE_LIMITER = Symbol("RATE_LIMITER");

/** Thrown by use cases that enforce a limit themselves (e.g. per account). */
export class RateLimitExceededError extends Error {
  constructor(readonly result: RateLimitResult) {
    super("Rate limit exceeded");
    this.name = "RateLimitExceededError";
  }
}

/** The `RateLimit-*` headers of docs/API.md, plus `Retry-After` once the limit is hit. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSeconds),
    ...(result.allowed ? {} : { "Retry-After": String(Math.max(1, result.resetSeconds)) }),
  };
}
