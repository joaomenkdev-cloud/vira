import type { RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";

/** Request budgets of the organizer's event routes (docs/API.md), checked per account. */
export const EVENTS_RATE_LIMITS = {
  /** Each URL lets the caller put up to 5 MB in the bucket. */
  imageUploadAccount: { name: "events.image_upload.account", limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;
