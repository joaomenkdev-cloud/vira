import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";

import { ProblemException } from "../errors/problem.exception.js";
import {
  RATE_LIMITER,
  type RateLimiter,
  rateLimitHeaders,
  type RateLimitRule,
} from "./rate-limiter.js";

const RATE_LIMIT_RULE = "vira:rate-limit-rule";

/**
 * Limits a route per client IP. The guard runs before body validation and before
 * any use case, so a flood is refused before it costs a hash or a query. Limits
 * per account need the parsed body and live in the use case instead.
 */
export const RateLimit = (rule: RateLimitRule): ClassDecorator & MethodDecorator =>
  applyDecorators(SetMetadata(RATE_LIMIT_RULE, rule), UseGuards(RateLimitGuard));

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const http = context.switchToHttp();
    // `req.ip` honours TRUST_PROXY_HOPS; the raw socket address would be the proxy's.
    const result = await this.limiter.hit(rule, http.getRequest<Request>().ip ?? "unknown");

    const headers = rateLimitHeaders(result);
    http.getResponse<Response>().set(headers);
    if (!result.allowed) throw new ProblemException("rate-limited", { headers });
    return true;
  }
}
