import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { TokenPurpose, VerificationToken } from "../../domain/verification-token.js";

export interface ConsumedToken {
  readonly userId: string;
  /** Set for EMAIL_CHANGE tokens: the address the link was sent to. */
  readonly newEmail: string | null;
}

export interface VerificationTokenRepository {
  /**
   * Stores `token` and discards every other unused token of the same user and purpose,
   * so only the link in the latest e-mail works.
   */
  replaceUnused(token: VerificationToken): Promise<void>;

  /**
   * Uses the token up, once: succeeds only for a token that exists, has not been used
   * and has not expired, and answers with whose token it was. An unknown, used or
   * expired token all answer `null`, which is all a caller may tell the client.
   */
  consume(
    tokenHash: Buffer,
    purpose: TokenPurpose,
    now: Date,
    tx?: TransactionContext,
  ): Promise<ConsumedToken | null>;
}

export const VERIFICATION_TOKEN_REPOSITORY = Symbol("VERIFICATION_TOKEN_REPOSITORY");
