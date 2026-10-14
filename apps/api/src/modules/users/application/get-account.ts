import { Inject, Injectable } from "@nestjs/common";

import type { Account } from "../domain/account.js";
import { AccountNotFoundError } from "./errors.js";
import { ACCOUNT_REPOSITORY, type AccountRepository } from "./ports/account-repository.js";

/** The caller's own account. Only ever looked up by the id in the session. */
@Injectable()
export class GetAccount {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  /** @throws AccountNotFoundError when the account behind the session is gone. */
  async execute(userId: string): Promise<Account> {
    const account = await this.accounts.findById(userId);
    if (!account) throw new AccountNotFoundError();
    return account;
  }
}
