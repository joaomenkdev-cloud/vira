import type { RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";

/** Budgets per account (docs/API.md#conta-e-privacidade-users). */
export const PRIVACY_RATE_LIMITS = {
  /** The whole account in one file is a heavy read: a few a day are plenty. */
  export: { name: "privacy.export.account", limit: 3, windowSeconds: 24 * 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;
