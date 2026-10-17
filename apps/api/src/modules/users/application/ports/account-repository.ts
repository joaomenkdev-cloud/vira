import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { Account, OrganizerProfile } from "../../domain/account.js";

/** Why an organizer profile was not created. */
export type CreateProfileOutcome = "created" | "account-has-profile" | "slug-taken";

export interface AccountRepository {
  findById(id: string): Promise<Account | null>;

  /** The id of the user's organizer profile, or `null` when there is none. */
  findOrganizerProfileId(userId: string): Promise<string | null>;

  /** Answers whether the account exists (and was renamed). */
  rename(id: string, name: string): Promise<boolean>;

  /**
   * Inserts the profile unless the account already has one or its slug is taken, even
   * by a concurrent request; says which, without failing the surrounding transaction.
   */
  createOrganizerProfile(
    profile: OrganizerProfile,
    tx?: TransactionContext,
  ): Promise<CreateProfileOutcome>;

  /** BUYER becomes ORGANIZER; ORGANIZER and ADMIN are left as they are (roles are cumulative). */
  promoteToOrganizer(userId: string, tx?: TransactionContext): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol("ACCOUNT_REPOSITORY");
