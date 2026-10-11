import { Inject, Injectable } from "@nestjs/common";
import type { LoginRequest, PublicUser } from "@vira/shared";

import {
  RATE_LIMITER,
  RateLimitExceededError,
  type RateLimiter,
} from "../../../platform/rate-limit/rate-limiter.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog, type AuditEvent } from "../../audit/application/public-api.js";
import { lockSecondsAfter } from "../domain/lockout-policy.js";
import { isEmailVerified, isLocked, toPublicUser, type User } from "../domain/user.js";
import { EmailNotVerifiedError, InvalidCredentialsError } from "./errors.js";
import { PASSWORD_HASHER, type PasswordHasher } from "./ports/password-hasher.js";
import { USER_REPOSITORY, type UserRepository } from "./ports/user-repository.js";
import { AUTH_RATE_LIMITS } from "./rate-limits.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/**
 * Checks an e-mail and password. Cookies and sessions belong to the next delivery
 * (N4): for now a successful login only answers with the user.
 *
 * Every refusal that does not depend on knowing the password (no such account, a
 * locked account, an account without a password) is the same `InvalidCredentialsError`
 * and costs the same hash verification, so neither the answer nor its timing says
 * whether the account exists (docs/SECURITY_MODEL.md, 3.1).
 */
@Injectable()
export class LoginUser {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws RateLimitExceededError after too many attempts on this account.
   * @throws InvalidCredentialsError for any e-mail/password pair that does not log in.
   * @throws EmailNotVerifiedError for the right password on an unverified account.
   */
  async execute(request: LoginRequest, context: RequestContext = {}): Promise<PublicUser> {
    // The account budget is spent before any hash, so a flood against one account
    // costs the server nothing but a counter.
    const budget = await this.limiter.hit(AUTH_RATE_LIMITS.loginAccount, request.email);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const now = this.clock.now();
    const user = await this.users.findByEmail(request.email);
    const locked = user !== null && isLocked(user, now);

    // A locked account is not even checked against its hash: the password is not
    // allowed to work during a lock, or the lock would protect nothing.
    const passwordMatches = await this.hasher.verify(
      user && !locked ? user.passwordHash : null,
      request.password,
    );

    if (!user) {
      await this.recordFailure(undefined, "invalid_credentials", context);
      throw new InvalidCredentialsError();
    }
    if (locked) {
      await this.recordFailure(user, "locked", context);
      throw new InvalidCredentialsError();
    }
    if (!passwordMatches) {
      await this.registerFailedPassword(user, now, context);
      await this.recordFailure(user, "invalid_credentials", context);
      throw new InvalidCredentialsError();
    }

    if (user.failedLoginCount > 0 || user.lockedUntil !== null) {
      await this.users.clearLoginFailures(user.id);
    }
    if (!isEmailVerified(user)) {
      await this.recordFailure(user, "email_not_verified", context);
      throw new EmailNotVerifiedError();
    }

    await this.audit.record(
      { action: "auth.login_succeeded", entityId: user.id, metadata: { method: "password" } },
      { actor: { id: user.id, role: user.role }, ...withRequestId(context) },
    );
    return toPublicUser(user);
  }

  /** Counts the failure and, from the fifth in a row, locks the account for longer each time. */
  private async registerFailedPassword(
    user: User,
    now: Date,
    context: RequestContext,
  ): Promise<void> {
    const failedAttempts = await this.users.recordFailedLogin(user.id);
    const lockSeconds = lockSecondsAfter(failedAttempts);
    if (lockSeconds === 0) return;

    await this.users.lockUntil(user.id, new Date(now.getTime() + lockSeconds * 1000));
    await this.audit.record(
      {
        action: "auth.account_locked",
        entityId: user.id,
        metadata: { failedAttempts, lockSeconds },
      },
      { actor: "system", ...withRequestId(context) },
    );
  }

  /** The person has not proved who they are, so the actor is the system, not the account. */
  private async recordFailure(
    user: User | undefined,
    reason: Extract<AuditEvent, { action: "auth.login_failed" }>["metadata"]["reason"],
    context: RequestContext,
  ): Promise<void> {
    await this.audit.record(
      {
        action: "auth.login_failed",
        ...(user ? { entityId: user.id } : {}),
        metadata: { reason },
      },
      { actor: "system", ...withRequestId(context) },
    );
  }
}
