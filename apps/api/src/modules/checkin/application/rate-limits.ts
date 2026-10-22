import type { RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";

/**
 * Budgets per operator (docs/API.md#check-in-checkin): a busy door reads a QR every
 * second or so; typed codes are few, and their budget is what keeps them from being
 * guessed (docs/SECURITY_MODEL.md#34-check-in).
 */
export const CHECKIN_RATE_LIMITS = {
  scan: { name: "checkin.scan.operator", limit: 120, windowSeconds: 60 },
  code: { name: "checkin.code.operator", limit: 20, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
