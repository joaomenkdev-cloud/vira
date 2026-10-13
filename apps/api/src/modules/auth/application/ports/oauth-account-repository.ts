import type { OAuthProviderName } from "@vira/shared";

import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { OAuthAccount } from "../../domain/oauth.js";

export interface OAuthAccountRepository {
  /** The Vira account linked to this provider account, if any. */
  findUserId(provider: OAuthProviderName, providerAccountId: string): Promise<string | null>;

  /**
   * Links the provider account. `false` when it is already linked, even by a
   * concurrent request (nothing is written then).
   */
  link(account: OAuthAccount, tx?: TransactionContext): Promise<boolean>;
}

export const OAUTH_ACCOUNT_REPOSITORY = Symbol("OAUTH_ACCOUNT_REPOSITORY");
