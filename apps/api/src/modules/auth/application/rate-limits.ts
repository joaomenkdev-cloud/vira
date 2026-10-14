import type { RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";

/**
 * Request budgets of the authentication endpoints (docs/API.md). The per-IP rules
 * are enforced by a guard before anything else runs; the per-account one is checked
 * by the use case, before the password is hashed.
 */
export const AUTH_RATE_LIMITS = {
  register: { name: "auth.register.ip", limit: 5, windowSeconds: 60 * 60 },
  verifyEmail: { name: "auth.verify.ip", limit: 10, windowSeconds: 60 * 60 },
  loginIp: { name: "auth.login.ip", limit: 10, windowSeconds: 15 * 60 },
  loginAccount: { name: "auth.login.account", limit: 5, windowSeconds: 15 * 60 },
  refresh: { name: "auth.refresh.ip", limit: 30, windowSeconds: 60 },
  oauthStart: { name: "auth.oauth_start.ip", limit: 20, windowSeconds: 60 },
  oauthCallback: { name: "auth.oauth_callback.ip", limit: 20, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
