import { Inject, Injectable } from "@nestjs/common";
import type { DeleteAccountRequest } from "@vira/shared";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { EraseAccount } from "../../privacy/application/public-api.js";
import { CurrentPassword } from "./current-password.js";
import type { SessionOwner } from "./end-session.js";
import {
  AccountNotFoundError,
  PasswordRequiredError,
  ReauthenticationRequiredError,
} from "./errors.js";
import { SESSION_REPOSITORY, type SessionRepository } from "./ports/session-repository.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/** How fresh the login of an account without a password must be to delete it. */
export const RECENT_LOGIN_MS = 5 * 60_000;

/**
 * Deletes the caller's account (docs/PRIVACY.md#o-que-acontece-ao-excluir-a-conta), once
 * they proved again who they are: the password, or for an account of social login only,
 * a login made in the last five minutes. The erasure itself is the `privacy` module's;
 * it also removes every session of the account.
 */
@Injectable()
export class DeleteAccount {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly currentPassword: CurrentPassword,
    private readonly eraseAccount: EraseAccount,
  ) {}

  /**
   * @throws PasswordRequiredError when the account has a password and none was given.
   * @throws the errors of CurrentPassword.confirm (rate limit, wrong password).
   * @throws ReauthenticationRequiredError when an account without a password logged in too long ago.
   * @throws AccountNotFoundError when the account behind the session is gone.
   * @throws the errors of EraseAccount (an organizer with events still to come).
   */
  async execute(
    owner: SessionOwner,
    request: DeleteAccountRequest,
    context: RequestContext = {},
  ): Promise<void> {
    const user = await this.users.findById(owner.id);
    if (!user) throw new AccountNotFoundError();

    if (user.passwordHash !== null) {
      if (request.password === undefined) throw new PasswordRequiredError();
      await this.currentPassword.confirm(user.id, request.password);
    } else {
      const now = this.clock.now();
      const session = (await this.sessions.listActive(user.id, now)).find(
        (active) => active.id === owner.sessionId,
      );
      if (!session || now.getTime() - session.authenticatedAt.getTime() > RECENT_LOGIN_MS) {
        throw new ReauthenticationRequiredError();
      }
    }

    await this.eraseAccount.execute({ id: user.id, role: user.role }, withRequestId(context));
  }
}
