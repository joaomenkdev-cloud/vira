import { Inject, Injectable } from "@nestjs/common";
import type { UpdateProfileRequest } from "@vira/shared";

import type { Account } from "../domain/account.js";
import { AccountNotFoundError } from "./errors.js";
import { GetAccount } from "./get-account.js";
import { ACCOUNT_REPOSITORY, type AccountRepository } from "./ports/account-repository.js";

/**
 * Edits the caller's profile. Only the name: the request schema refuses every other
 * field, and the role, e-mail and password are never written from here.
 */
@Injectable()
export class UpdateProfile {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    private readonly getAccount: GetAccount,
  ) {}

  /** @throws AccountNotFoundError when the account behind the session is gone. */
  async execute(userId: string, request: UpdateProfileRequest): Promise<Account> {
    if (!(await this.accounts.rename(userId, request.name))) throw new AccountNotFoundError();
    return this.getAccount.execute(userId);
  }
}
