import { Inject, Injectable } from "@nestjs/common";
import type { ResetPasswordRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { hashVerificationToken } from "../domain/verification-token.js";
import { InvalidTokenError } from "./errors.js";
import { NewPasswords } from "./new-passwords.js";
import { SESSION_REPOSITORY, type SessionRepository } from "./ports/session-repository.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "./ports/verification-token-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/**
 * Sets a new password with the single-use token from a reset link, and ends every
 * session of the account: whoever may have known the old password is logged out.
 *
 * The link went to the account's address, so using it also proves the address: an
 * account never verified becomes verified, and an account that only used social login
 * gets its first password this way.
 */
@Injectable()
export class ResetPassword {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: VerificationTokenRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly newPasswords: NewPasswords,
    private readonly outbox: Outbox,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws BreachedPasswordError when the new password is in known breaches; the token
   *   is not spent, so the person can pick another one with the same link.
   * @throws InvalidTokenError when the token is unknown, already used or expired.
   */
  async execute(request: ResetPasswordRequest, context: RequestContext = {}): Promise<void> {
    const passwordHash = await this.newPasswords.hash(request.password);
    const now = this.clock.now();

    // Spending the token, replacing the password and asking for the notice e-mail
    // happen together or not at all.
    const userId = await this.transactions.run(async (tx) => {
      const consumed = await this.tokens.consume(
        hashVerificationToken(request.token),
        "PASSWORD_RESET",
        now,
        tx,
      );
      if (!consumed) return null;
      await this.users.setPassword(consumed.userId, passwordHash, tx);
      await this.users.markEmailVerified(consumed.userId, now, tx);
      await this.outbox.publish(
        { type: "auth.password_changed_notice", payload: { userId: consumed.userId } },
        tx,
      );
      return consumed.userId;
    });
    if (userId === null) throw new InvalidTokenError();

    await this.sessions.revokeAllOf(userId, "PASSWORD_CHANGED", now);

    const user = await this.users.findById(userId);
    await this.audit.record(
      { action: "auth.password_changed", entityId: userId, metadata: { via: "reset" } },
      {
        actor: user ? { id: user.id, role: user.role } : "system",
        ...withRequestId(context),
      },
    );
  }
}
