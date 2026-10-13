import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { Session, SessionRevokeReason } from "../../domain/session.js";

/** One login that can still be refreshed, as shown to its owner. */
export interface ActiveSession {
  /** The family id: the session id of the access tokens issued from it. */
  readonly id: string;
  readonly authenticatedAt: Date;
  /** When the current token was issued (the last refresh, or the login). */
  readonly lastRefreshedAt: Date;
  readonly expiresAt: Date;
}

export interface SessionRepository {
  create(session: Session, tx?: TransactionContext): Promise<void>;

  findByTokenHash(tokenHash: Buffer): Promise<Session | null>;

  /**
   * Retires a token, once: of two requests presenting the same token at once, exactly
   * one gets `true`. `false` means the token was already rotated or revoked.
   */
  markRotated(id: string, now: Date, tx?: TransactionContext): Promise<boolean>;

  /** Revokes every token of the family still unrevoked; answers how many it revoked. */
  revokeFamily(familyId: string, reason: SessionRevokeReason, now: Date): Promise<number>;

  /**
   * Revokes the family only if it belongs to `userId` and can still be refreshed;
   * answers whether it did.
   */
  revokeActiveFamilyOf(
    userId: string,
    familyId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean>;

  /** Revokes every family of the user; answers how many logins were still active. */
  revokeAllOf(userId: string, reason: SessionRevokeReason, now: Date): Promise<number>;

  /** The user's logins that can still be refreshed, most recent first. */
  listActive(userId: string, now: Date): Promise<ActiveSession[]>;
}

export const SESSION_REPOSITORY = Symbol("SESSION_REPOSITORY");
