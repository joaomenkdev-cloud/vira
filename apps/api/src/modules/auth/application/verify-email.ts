import { Inject, Injectable } from "@nestjs/common";
import type { PublicUser, VerifyEmailRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { toPublicUser } from "../domain/user.js";
import { hashVerificationToken } from "../domain/verification-token.js";
import { InvalidTokenError } from "./errors.js";
import { type RequestContext, withRequestId } from "./request-context.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import {
  VERIFICATION_TOKEN_REPOSITORY,
  type VerificationTokenRepository,
} from "./ports/verification-token-repository.js";

/** Confirms an e-mail address with the single-use token from the link we sent. */
@Injectable()
export class VerifyEmail {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(VERIFICATION_TOKEN_REPOSITORY) private readonly tokens: VerificationTokenRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /** @throws InvalidTokenError when the token is unknown, already used or expired. */
  async execute(request: VerifyEmailRequest, context: RequestContext = {}): Promise<PublicUser> {
    const now = this.clock.now();

    // Using the token up and verifying the address succeed or fail together: the token
    // is never spent without the address being verified, and never the other way around.
    const userId = await this.transactions.run(async (tx) => {
      const consumed = await this.tokens.consume(
        hashVerificationToken(request.token),
        "EMAIL_VERIFICATION",
        now,
        tx,
      );
      if (!consumed) return null;
      await this.users.markEmailVerified(consumed.userId, now, tx);
      return consumed.userId;
    });
    if (userId === null) throw new InvalidTokenError();

    const user = await this.users.findById(userId);
    if (!user) throw new InvalidTokenError();

    await this.audit.record(
      { action: "auth.email_verified", entityId: user.id, metadata: {} },
      {
        actor: { id: user.id, role: user.role },
        ...withRequestId(context),
      },
    );
    return toPublicUser(user);
  }
}
