import { Inject, Injectable } from "@nestjs/common";

import { ACCOUNT_REPOSITORY, type AccountRepository } from "./ports/account-repository.js";

export interface AccountContact {
  readonly name: string;
  readonly email: string;
}

/**
 * The name and e-mail of an account, for the modules that keep a copy of them (the
 * `orders` module, on the receipt). Only by the id in the session.
 */
@Injectable()
export class AccountContacts {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  /** `null` when the account behind the session is gone. */
  async contactOf(userId: string): Promise<AccountContact | null> {
    const account = await this.accounts.findById(userId);
    return account && { name: account.name, email: account.email };
  }
}
