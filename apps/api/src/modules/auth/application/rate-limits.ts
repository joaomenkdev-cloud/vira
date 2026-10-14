import type { RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";

/**
 * Request budgets of the authentication endpoints (docs/API.md). The per-IP rules
 * are enforced by a guard before anything else runs; the per-account ones are checked
 * by the use cases, before any password is hashed or e-mail is sent.
 */
export const AUTH_RATE_LIMITS = {
  register: { name: "auth.register.ip", limit: 5, windowSeconds: 60 * 60 },
  verifyEmail: { name: "auth.verify.ip", limit: 10, windowSeconds: 60 * 60 },
  loginIp: { name: "auth.login.ip", limit: 10, windowSeconds: 15 * 60 },
  loginAccount: { name: "auth.login.account", limit: 5, windowSeconds: 15 * 60 },
  refresh: { name: "auth.refresh.ip", limit: 30, windowSeconds: 60 },
  oauthStart: { name: "auth.oauth_start.ip", limit: 20, windowSeconds: 60 },
  oauthCallback: { name: "auth.oauth_callback.ip", limit: 20, windowSeconds: 60 },
  forgotPasswordIp: { name: "auth.forgot_password.ip", limit: 5, windowSeconds: 60 * 60 },
  /** Per address, silent: past it the answer is still `202`, but no e-mail goes out. */
  forgotPasswordAccount: {
    name: "auth.forgot_password.account",
    limit: 3,
    windowSeconds: 60 * 60,
  },
  resetPasswordIp: { name: "auth.reset_password.ip", limit: 10, windowSeconds: 60 * 60 },
  /** Guesses at the current password from inside a session (password and e-mail change). */
  currentPasswordAccount: {
    name: "auth.current_password.account",
    limit: 5,
    windowSeconds: 15 * 60,
  },
  /** Each request sends e-mails, to an address the caller chooses. */
  changeEmailAccount: { name: "auth.change_email.account", limit: 3, windowSeconds: 60 * 60 },
  confirmEmailChangeIp: { name: "auth.confirm_email.ip", limit: 10, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimitRule>;
