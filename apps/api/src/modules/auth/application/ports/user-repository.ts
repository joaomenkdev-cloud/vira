import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { User } from "../../domain/user.js";

/** Another account already uses this e-mail (the unique index said so). */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("E-mail already registered");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export interface UserRepository {
  /** `email` is already normalized (trimmed, lower case). */
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;

  /** @throws EmailAlreadyRegisteredError when the e-mail is taken, even by a concurrent request. */
  create(user: User, tx?: TransactionContext): Promise<void>;

  /** Sets `email_verified_at` unless it is already set. */
  markEmailVerified(userId: string, at: Date, tx?: TransactionContext): Promise<void>;

  /**
   * The owner of the e-mail proved it through a social login. An account that was
   * never verified is taken over by that owner: it becomes verified and loses the
   * password, which whoever registered it chose without proving the e-mail was theirs.
   * A verified account is left as it is.
   */
  confirmEmailThroughProvider(userId: string, at: Date, tx?: TransactionContext): Promise<void>;

  /** Adds one failed login atomically and returns the new count. */
  recordFailedLogin(userId: string): Promise<number>;
  /** Refuses password logins until `until` (never shortens an existing lock). */
  lockUntil(userId: string, until: Date): Promise<void>;
  /** Back to zero failures and no lock, after the right password. */
  clearLoginFailures(userId: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
