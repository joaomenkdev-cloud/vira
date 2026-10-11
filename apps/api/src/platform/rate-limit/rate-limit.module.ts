import { Global, Module } from "@nestjs/common";

import { RateLimitGuard } from "./rate-limit.guard.js";
import { RATE_LIMITER } from "./rate-limiter.js";
import { RedisRateLimiter } from "./redis-rate-limiter.js";

@Global()
@Module({
  providers: [RateLimitGuard, { provide: RATE_LIMITER, useClass: RedisRateLimiter }],
  exports: [RATE_LIMITER, RateLimitGuard],
})
export class RateLimitModule {}
