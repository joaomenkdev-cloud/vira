import { Inject, Injectable } from "@nestjs/common";
import type { ConfirmEmailChangeRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { hashVerificationToken } from "../domain/verification-token.js";
import { InvalidTokenError } from "./errors.js";
import {
  EmailAlreadyRegisteredError,
  USER_REPOSITORY,
  type UserRepository,
} from "./ports/user-repository.js";
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "./ports/verification-token-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/**
 * Completes an e-mail change with the token from the link sent to the new address.
 * The token names the address it was sent to, and the account moves only if that is
 * still its pending address: a link from an earlier request (to another address)
 * confirms nothing. Sessions stay open; the access token carries no e-mail.
 */
@Injectable()
export class ConfirmEmailChange {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: VerificationTokenRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws InvalidTokenError when the token is unknown, used or expired, when the
   *   address is no longer the pending one, or when another account took it meanwhile.
   */
  async execute(request: ConfirmEmailChangeRequest, context: RequestContext = {}): Promise<void> {
    const now = this.clock.now();

    let userId: string | null;
    try {
      userId = await this.transactions.run(async (tx) => {
        const consumed = await this.tokens.consume(
          hashVerificationToken(request.token),
          "EMAIL_CHANGE",
          now,
          tx,
        );
        if (!consumed?.newEmail) return null;
        const moved = await this.users.confirmEmailChange(
          consumed.userId,
          consumed.newEmail,
          now,
          tx,
        );
        return moved ? consumed.userId : null;
      });
    } catch (error) {
      if (!(error instanceof EmailAlreadyRegisteredError)) throw error;
      userId = null;
    }
    if (userId === null) throw new InvalidTokenError();

    const user = await this.users.findById(userId);
    await this.audit.record(
      { action: "auth.email_changed", entityId: userId, metadata: {} },
      {
        actor: user ? { id: user.id, role: user.role } : "system",
        ...withRequestId(context),
      },
    );
  }
}
