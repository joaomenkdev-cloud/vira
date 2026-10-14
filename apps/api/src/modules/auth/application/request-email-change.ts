import { Inject, Injectable } from "@nestjs/common";
import type { ChangeEmailRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  RATE_LIMITER,
  RateLimitExceededError,
  type RateLimiter,
} from "../../../platform/rate-limit/rate-limiter.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { CurrentPassword } from "./current-password.js";
import type { SessionOwner } from "./end-session.js";
import { SameEmailError } from "./errors.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { AUTH_RATE_LIMITS } from "./rate-limits.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/**
 * Starts moving the caller's account to another address. Nothing changes until the
 * link sent to the new address is used (ConfirmEmailChange); the current address is
 * told about the request, in case it was not its owner.
 *
 * An address that already belongs to another account gets the same `202`, so this
 * route cannot be used to find out who has an account: the owner of that address is
 * notified instead, and the caller's account stays as it was.
 */
@Injectable()
export class RequestEmailChange {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly currentPassword: CurrentPassword,
    private readonly outbox: Outbox,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws the errors of CurrentPassword.confirm (rate limit, no password, wrong password).
   * @throws SameEmailError when the address is already the account's.
   * @throws RateLimitExceededError after too many requests from this account.
   */
  async execute(
    owner: SessionOwner,
    request: ChangeEmailRequest,
    context: RequestContext = {},
  ): Promise<void> {
    const user = await this.currentPassword.confirm(owner.id, request.currentPassword);
    if (request.email === user.email) throw new SameEmailError();

    // Each request sends e-mails to an address the caller picks: budgeted per account.
    const budget = await this.limiter.hit(AUTH_RATE_LIMITS.changeEmailAccount, user.id);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const holder = await this.users.findByEmail(request.email);
    if (holder) {
      await this.outbox.publish({
        type: "auth.email_in_use_notice",
        payload: { userId: holder.id },
      });
    } else {
      await this.transactions.run(async (tx) => {
        await this.users.setPendingEmail(user.id, request.email, tx);
        await this.outbox.publish(
          { type: "auth.email_change_requested", payload: { userId: user.id } },
          tx,
        );
      });
    }

    await this.audit.record(
      { action: "auth.email_change_requested", entityId: user.id, metadata: {} },
      { actor: { id: user.id, role: user.role }, ...withRequestId(context) },
    );
  }
}
