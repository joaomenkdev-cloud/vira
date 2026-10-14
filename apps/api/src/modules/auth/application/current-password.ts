import { Inject, Injectable } from "@nestjs/common";

import {
  RATE_LIMITER,
  RateLimitExceededError,
  type RateLimiter,
} from "../../../platform/rate-limit/rate-limiter.js";
import type { User } from "../domain/user.js";
import { AccountNotFoundError, IncorrectPasswordError, PasswordNotSetError } from "./errors.js";
import { PASSWORD_HASHER, type PasswordHasher } from "./ports/password-hasher.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { AUTH_RATE_LIMITS } from "./rate-limits.js";

/**
 * Re-authentication for sensitive changes made from a session (password, e-mail): a
 * stolen session alone is not enough, the current password is asked again. Guesses
 * are budgeted per account, before any hash, like the login.
 */
@Injectable()
export class CurrentPassword {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  /**
   * The caller's account, once `password` proved to be its password.
   * @throws RateLimitExceededError after too many attempts on this account.
   * @throws AccountNotFoundError when the account behind the session is gone.
   * @throws PasswordNotSetError for an account without a password (social login only).
   * @throws IncorrectPasswordError when the password is wrong.
   */
  async confirm(userId: string, password: string): Promise<User> {
    const budget = await this.limiter.hit(AUTH_RATE_LIMITS.currentPasswordAccount, userId);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const user = await this.users.findById(userId);
    if (!user) throw new AccountNotFoundError();
    if (user.passwordHash === null) throw new PasswordNotSetError();
    if (!(await this.hasher.verify(user.passwordHash, password))) {
      throw new IncorrectPasswordError();
    }
    return user;
  }
}
