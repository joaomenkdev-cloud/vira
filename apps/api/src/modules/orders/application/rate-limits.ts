import type { RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";

/** Request budgets of the order routes (docs/API.md#pedidos-orders). */
export const ORDERS_RATE_LIMITS = {
  createIp: { name: "orders.create.ip", limit: 30, windowSeconds: 60 },
  createAccount: { name: "orders.create.account", limit: 10, windowSeconds: 60 },
  paymentAccount: { name: "orders.payment.account", limit: 10, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
