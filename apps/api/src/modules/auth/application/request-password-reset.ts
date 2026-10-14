import { Inject, Injectable } from "@nestjs/common";
import type { ForgotPasswordRequest } from "@vira/shared";

import { RATE_LIMITER, type RateLimiter } from "../../../platform/rate-limit/rate-limiter.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { AUTH_RATE_LIMITS } from "./rate-limits.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/**
 * "Forgot password": asks the worker to e-mail a reset link to the account's address.
 * The caller learns nothing either way (docs/SECURITY_MODEL.md, "Enumeração de contas"):
 * the controller answers `202` whether or not the address has an account, and whether
 * or not this address already got too many links this hour.
 */
@Injectable()
export class RequestPasswordReset {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly outbox: Outbox,
    private readonly audit: AuditLog,
  ) {}

  async execute(request: ForgotPasswordRequest, context: RequestContext = {}): Promise<void> {
    // Counted per address, known or not, so the budget says nothing about the account.
    // Past it the request is quietly dropped: someone else's mailbox is not a target.
    const budget = await this.limiter.hit(AUTH_RATE_LIMITS.forgotPasswordAccount, request.email);
    if (!budget.allowed) return;

    const user = await this.users.findByEmail(request.email);
    if (!user) return;

    await this.outbox.publish({
      type: "auth.password_reset_requested",
      payload: { userId: user.id },
    });
    await this.audit.record(
      { action: "auth.password_reset_requested", entityId: user.id, metadata: {} },
      { actor: "system", ...withRequestId(context) },
    );
  }
}
