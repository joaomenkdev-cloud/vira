import { Inject, Injectable } from "@nestjs/common";
import type { ChangePasswordRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import { CurrentPassword } from "./current-password.js";
import type { SessionOwner } from "./end-session.js";
import { NewPasswords } from "./new-passwords.js";
import { SESSION_REPOSITORY, type SessionRepository } from "./ports/session-repository.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/**
 * Changes the password of the caller, who must type the current one. Every other
 * session of the account ends; the one the change was made from stays open.
 */
@Injectable()
export class ChangePassword {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly currentPassword: CurrentPassword,
    private readonly newPasswords: NewPasswords,
    private readonly outbox: Outbox,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws the errors of CurrentPassword.confirm (rate limit, no password, wrong password).
   * @throws BreachedPasswordError when the new password appears in known breaches.
   */
  async execute(
    owner: SessionOwner,
    request: ChangePasswordRequest,
    context: RequestContext = {},
  ): Promise<void> {
    const user = await this.currentPassword.confirm(owner.id, request.currentPassword);
    const passwordHash = await this.newPasswords.hash(request.newPassword);

    await this.transactions.run(async (tx) => {
      await this.users.setPassword(user.id, passwordHash, tx);
      await this.outbox.publish(
        { type: "auth.password_changed_notice", payload: { userId: user.id } },
        tx,
      );
    });
    await this.sessions.revokeAllOf(user.id, "PASSWORD_CHANGED", this.clock.now(), owner.sessionId);

    await this.audit.record(
      { action: "auth.password_changed", entityId: user.id, metadata: { via: "change" } },
      { actor: { id: user.id, role: user.role }, ...withRequestId(context) },
    );
  }
}
