import { Inject, Injectable } from "@nestjs/common";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { AccessTokens } from "../../../platform/security/access-token.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { hashRefreshToken, isExpired, rotateSession, type Session } from "../domain/session.js";
import { isEmailVerified } from "../domain/user.js";
import { InvalidSessionError } from "./errors.js";
import { SESSION_REPOSITORY, type SessionRepository } from "./ports/session-repository.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";
import type { SessionCredentials } from "./session-credentials.js";

/**
 * Exchanges a refresh token for a new one and a new access token (ADR-0005). Every
 * token works once. Presenting a token that was already exchanged means two parties
 * hold the same family (the owner and whoever copied the token), and we cannot tell
 * which is which, so the whole family is revoked and both have to log in again
 * (docs/SECURITY_MODEL.md 3.1).
 */
@Injectable()
export class RefreshSession {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly accessTokens: AccessTokens,
    private readonly audit: AuditLog,
  ) {}

  /** @throws InvalidSessionError for any token that does not refresh, whatever the reason. */
  async execute(refreshToken: string, context: RequestContext = {}): Promise<SessionCredentials> {
    const now = this.clock.now();
    const current = await this.sessions.findByTokenHash(hashRefreshToken(refreshToken));
    // Unknown (no row) or already revoked.
    if (current?.revokedAt !== null) throw new InvalidSessionError();
    if (current.rotatedAt !== null) return this.reuseDetected(current, now, context);
    if (isExpired(current, now)) throw new InvalidSessionError();

    // The role is read again on every refresh, so a change reaches the access token
    // within its ten minutes.
    const user = await this.users.findById(current.userId);
    if (!user || !isEmailVerified(user)) throw new InvalidSessionError();

    const next = rotateSession(current, { id: this.ids.next(), now });
    const rotated = await this.transactions.run(async (tx) => {
      if (!(await this.sessions.markRotated(current.id, now, tx))) return false;
      await this.sessions.create(next.record, tx);
      return true;
    });
    // Someone exchanged the same token between our read and our update.
    if (!rotated) return this.reuseDetected(current, now, context);

    const access = this.accessTokens.issue({
      sub: user.id,
      role: user.role,
      sid: current.familyId,
    });
    return {
      sessionId: current.familyId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: next.secret,
      refreshTokenExpiresAt: next.record.expiresAt,
    };
  }

  private async reuseDetected(reused: Session, now: Date, context: RequestContext): Promise<never> {
    const revokedSessions = await this.sessions.revokeFamily(
      reused.familyId,
      "REUSE_DETECTED",
      now,
    );
    // Zero means another request already revoked the family (and recorded it).
    if (revokedSessions > 0) {
      await this.audit.record(
        {
          action: "auth.refresh_reuse_detected",
          entityId: reused.familyId,
          metadata: { revokedSessions },
        },
        // Whoever presented the token has not proved to be the owner.
        { actor: "system", ...withRequestId(context) },
      );
    }
    throw new InvalidSessionError();
  }
}
