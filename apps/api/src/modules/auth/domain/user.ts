import type { PublicUser, Role } from "@vira/shared";

/** An account, as the authentication module sees it (docs/DATA_MODEL.md#users). */
export interface User {
  readonly id: string;
  /** Normalized: trimmed and lower case. */
  readonly email: string;
  readonly name: string;
  /** argon2id PHC string; `null` for accounts that only use social login. */
  readonly passwordHash: string | null;
  readonly role: Role;
  readonly emailVerifiedAt: Date | null;
  /** Consecutive failed password logins. */
  readonly failedLoginCount: number;
  /** Password logins are refused until this moment. */
  readonly lockedUntil: Date | null;
  readonly createdAt: Date;
}

/**
 * A freshly registered account. The role is fixed here, never read from a request:
 * everybody starts as BUYER and only an ADMIN can change that (docs/SECURITY_MODEL.md, 3.1).
 */
export function newUser(input: {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly now: Date;
}): User {
  return Object.freeze({
    id: input.id,
    email: input.email,
    name: input.name,
    passwordHash: input.passwordHash,
    role: "BUYER",
    emailVerifiedAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: input.now,
  });
}

export function isLocked(user: User, now: Date): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > now.getTime();
}

export function isEmailVerified(user: User): boolean {
  return user.emailVerifiedAt !== null;
}

/** What the API shows of an account: no hash, no counters. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: isEmailVerified(user),
  };
}
