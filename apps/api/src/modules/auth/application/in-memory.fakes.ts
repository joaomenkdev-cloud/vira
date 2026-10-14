import type { OAuthProviderName } from "@vira/shared";

import type {
  TransactionContext,
  TransactionRunner,
} from "../../../platform/database/transaction.js";
import type { MailMessage, Mailer } from "../../../platform/mail/mailer.js";
import type {
  RateLimiter,
  RateLimitResult,
  RateLimitRule,
} from "../../../platform/rate-limit/rate-limiter.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { Outbox } from "../../outbox/application/public-api.js";
import type { OAuthAccount } from "../domain/oauth.js";
import { isUsable, type Session, type SessionRevokeReason } from "../domain/session.js";
import { isLocked, type User } from "../domain/user.js";
import type { TokenPurpose, VerificationToken } from "../domain/verification-token.js";
import type { BreachedPasswords } from "./ports/breached-passwords.js";
import type { OAuthAccountRepository } from "./ports/oauth-account-repository.js";
import type { PasswordHasher } from "./ports/password-hasher.js";
import type { ActiveSession, SessionRepository } from "./ports/session-repository.js";
import { EmailAlreadyRegisteredError, type UserRepository } from "./ports/user-repository.js";
import type {
  ConsumedToken,
  VerificationTokenRepository,
} from "./ports/verification-token-repository.js";

/** Test doubles for the auth use cases: in-memory ports that behave like the real ones. */

interface FakeTransaction {
  readonly undo: (() => void)[];
}

function undoLogOf(tx: TransactionContext | undefined): (() => void)[] | undefined {
  return (tx as unknown as FakeTransaction | undefined)?.undo;
}

/** Runs `work` and, if it throws, takes back what the fakes recorded in the transaction. */
export class FakeTransactions implements TransactionRunner {
  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const tx: FakeTransaction = { undo: [] };
    try {
      return await work(tx as unknown as TransactionContext);
    } catch (error) {
      for (const undo of tx.undo.reverse()) undo();
      throw error;
    }
  }
}

export class FakeClock {
  constructor(public current = new Date("2026-10-11T12:00:00Z")) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class FakeIds {
  private n = 0;
  next(): string {
    return `0192a0e4-0000-7000-8000-${String(++this.n).padStart(12, "0")}`;
  }
}

export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve([...this.users.values()].find((u) => u.email === email) ?? null);
  }

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  create(user: User, tx?: TransactionContext): Promise<void> {
    if ([...this.users.values()].some((u) => u.email === user.email)) {
      return Promise.reject(new EmailAlreadyRegisteredError());
    }
    this.users.set(user.id, user);
    undoLogOf(tx)?.push(() => this.users.delete(user.id));
    return Promise.resolve();
  }

  markEmailVerified(userId: string, at: Date, tx?: TransactionContext): Promise<void> {
    const user = this.users.get(userId);
    if (user && !user.emailVerifiedAt) {
      this.users.set(userId, { ...user, emailVerifiedAt: at });
      undoLogOf(tx)?.push(() => this.users.set(userId, user));
    }
    return Promise.resolve();
  }

  confirmEmailThroughProvider(userId: string, at: Date, tx?: TransactionContext): Promise<void> {
    const user = this.users.get(userId);
    if (!user || user.emailVerifiedAt) return Promise.resolve();
    this.users.set(userId, {
      ...user,
      emailVerifiedAt: at,
      passwordHash: null,
      failedLoginCount: 0,
      lockedUntil: null,
    });
    undoLogOf(tx)?.push(() => this.users.set(userId, user));
    return Promise.resolve();
  }

  setPassword(userId: string, passwordHash: string, tx?: TransactionContext): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return Promise.reject(new Error("no such user"));
    this.users.set(userId, { ...user, passwordHash, failedLoginCount: 0, lockedUntil: null });
    undoLogOf(tx)?.push(() => this.users.set(userId, user));
    return Promise.resolve();
  }

  setPendingEmail(userId: string, pendingEmail: string, tx?: TransactionContext): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return Promise.reject(new Error("no such user"));
    this.users.set(userId, { ...user, pendingEmail });
    undoLogOf(tx)?.push(() => this.users.set(userId, user));
    return Promise.resolve();
  }

  confirmEmailChange(
    userId: string,
    newEmail: string,
    at: Date,
    tx?: TransactionContext,
  ): Promise<boolean> {
    const user = this.users.get(userId);
    if (user?.pendingEmail !== newEmail) return Promise.resolve(false);
    if ([...this.users.values()].some((u) => u.id !== userId && u.email === newEmail)) {
      return Promise.reject(new EmailAlreadyRegisteredError());
    }
    this.users.set(userId, { ...user, email: newEmail, pendingEmail: null, emailVerifiedAt: at });
    undoLogOf(tx)?.push(() => this.users.set(userId, user));
    return Promise.resolve(true);
  }

  recordFailedLogin(userId: string): Promise<number> {
    const user = this.users.get(userId);
    if (!user) return Promise.reject(new Error("no such user"));
    const failedLoginCount = user.failedLoginCount + 1;
    this.users.set(userId, { ...user, failedLoginCount });
    return Promise.resolve(failedLoginCount);
  }

  lockUntil(userId: string, until: Date): Promise<void> {
    const user = this.users.get(userId);
    if (user && (!user.lockedUntil || user.lockedUntil < until)) {
      this.users.set(userId, { ...user, lockedUntil: until });
    }
    return Promise.resolve();
  }

  clearLoginFailures(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) this.users.set(userId, { ...user, failedLoginCount: 0, lockedUntil: null });
    return Promise.resolve();
  }

  /** Test helper: the stored account. */
  get(id: string): User {
    const user = this.users.get(id);
    if (!user) throw new Error(`no user ${id}`);
    return user;
  }

  isLockedNow(id: string, now: Date): boolean {
    return isLocked(this.get(id), now);
  }
}

export class InMemoryOAuthAccountRepository implements OAuthAccountRepository {
  readonly accounts: OAuthAccount[] = [];
  /** Runs once inside `link`, before the insert: simulates a concurrent request. */
  beforeLink: (() => void) | undefined;

  findUserId(provider: OAuthProviderName, providerAccountId: string): Promise<string | null> {
    const account = this.accounts.find(
      (a) => a.provider === provider && a.providerAccountId === providerAccountId,
    );
    return Promise.resolve(account?.userId ?? null);
  }

  link(account: OAuthAccount, tx?: TransactionContext): Promise<boolean> {
    const interfere = this.beforeLink;
    this.beforeLink = undefined;
    interfere?.();
    if (
      this.accounts.some(
        (a) => a.provider === account.provider && a.providerAccountId === account.providerAccountId,
      )
    ) {
      return Promise.resolve(false);
    }
    this.accounts.push(account);
    undoLogOf(tx)?.push(() => this.accounts.splice(this.accounts.indexOf(account), 1));
    return Promise.resolve(true);
  }
}

interface StoredToken extends VerificationToken {
  usedAt: Date | null;
}

export class InMemoryVerificationTokenRepository implements VerificationTokenRepository {
  tokens: StoredToken[] = [];

  replaceUnused(token: VerificationToken): Promise<void> {
    this.tokens = this.tokens.filter(
      (t) => t.usedAt !== null || t.userId !== token.userId || t.purpose !== token.purpose,
    );
    this.tokens.push({ ...token, usedAt: null });
    return Promise.resolve();
  }

  consume(
    tokenHash: Buffer,
    purpose: TokenPurpose,
    now: Date,
    tx?: TransactionContext,
  ): Promise<ConsumedToken | null> {
    const token = this.tokens.find(
      (t) =>
        t.tokenHash.equals(tokenHash) &&
        t.purpose === purpose &&
        t.usedAt === null &&
        t.expiresAt > now,
    );
    if (!token) return Promise.resolve(null);
    token.usedAt = now;
    undoLogOf(tx)?.push(() => {
      token.usedAt = null;
    });
    return Promise.resolve({ userId: token.userId, newEmail: token.newEmail });
  }
}

type StoredSession = { -readonly [K in keyof Session]: Session[K] };

export class InMemorySessionRepository implements SessionRepository {
  readonly rows: StoredSession[] = [];
  readonly revokeReasons = new Map<string, SessionRevokeReason>();
  /** Runs once inside `markRotated`, before the update: simulates a concurrent request. */
  beforeRotate: (() => void) | undefined;

  create(session: Session, tx?: TransactionContext): Promise<void> {
    if (this.rows.some((row) => row.tokenHash.equals(session.tokenHash))) {
      return Promise.reject(new Error("duplicate token hash"));
    }
    const row = { ...session };
    this.rows.push(row);
    undoLogOf(tx)?.push(() => this.rows.splice(this.rows.indexOf(row), 1));
    return Promise.resolve();
  }

  findByTokenHash(tokenHash: Buffer): Promise<Session | null> {
    const row = this.rows.find((r) => r.tokenHash.equals(tokenHash));
    return Promise.resolve(row ? { ...row } : null);
  }

  markRotated(id: string, now: Date, tx?: TransactionContext): Promise<boolean> {
    const interfere = this.beforeRotate;
    this.beforeRotate = undefined;
    interfere?.();
    const row = this.rows.find((r) => r.id === id);
    if (row?.rotatedAt !== null || row.revokedAt !== null) return Promise.resolve(false);
    row.rotatedAt = now;
    undoLogOf(tx)?.push(() => {
      row.rotatedAt = null;
    });
    return Promise.resolve(true);
  }

  revokeFamily(familyId: string, reason: SessionRevokeReason, now: Date): Promise<number> {
    return Promise.resolve(this.revokeWhere((row) => row.familyId === familyId, reason, now));
  }

  revokeActiveFamilyOf(
    userId: string,
    familyId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean> {
    const family = (row: StoredSession) => row.userId === userId && row.familyId === familyId;
    if (!this.rows.some((row) => family(row) && isUsable(row, now))) return Promise.resolve(false);
    this.revokeWhere(family, reason, now);
    return Promise.resolve(true);
  }

  revokeAllOf(
    userId: string,
    reason: SessionRevokeReason,
    now: Date,
    except?: string,
  ): Promise<number> {
    const target = (row: StoredSession) => row.userId === userId && row.familyId !== except;
    const active = new Set(
      this.rows.filter((r) => target(r) && isUsable(r, now)).map((r) => r.familyId),
    );
    this.revokeWhere(target, reason, now);
    return Promise.resolve(active.size);
  }

  listActive(userId: string, now: Date): Promise<ActiveSession[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId && isUsable(row, now))
        .sort((a, b) => b.authenticatedAt.getTime() - a.authenticatedAt.getTime())
        .map((row) => ({
          id: row.familyId,
          authenticatedAt: row.authenticatedAt,
          lastRefreshedAt: row.createdAt,
          expiresAt: row.expiresAt,
        })),
    );
  }

  /** Test helper: every row of a family. */
  family(familyId: string): StoredSession[] {
    return this.rows.filter((row) => row.familyId === familyId);
  }

  private revokeWhere(
    match: (row: StoredSession) => boolean,
    reason: SessionRevokeReason,
    now: Date,
  ): number {
    let count = 0;
    for (const row of this.rows) {
      if (!match(row) || row.revokedAt !== null) continue;
      row.revokedAt = now;
      this.revokeReasons.set(row.id, reason);
      count++;
    }
    return count;
  }
}

/** Not a real hash: cheap, deterministic, and it records how often the use case hashed. */
export class FakePasswordHasher implements PasswordHasher {
  hashCalls = 0;
  /** What every `verify` was asked to check against: the stored hash, or `null`. */
  readonly verifyTargets: (string | null)[] = [];

  hash(password: string): Promise<string> {
    this.hashCalls++;
    return Promise.resolve(`$argon2id$fake$${password}`);
  }

  verify(hash: string | null, password: string): Promise<boolean> {
    this.verifyTargets.push(hash);
    return Promise.resolve(hash !== null && hash === `$argon2id$fake$${password}`);
  }
}

/** Answers from a fixed list of leaked passwords, and records what it was asked. */
export class FakeBreachedPasswords implements BreachedPasswords {
  readonly leaked = new Set<string>(["password123", "senha12345"]);
  readonly checked: string[] = [];

  includes(password: string): Promise<boolean> {
    this.checked.push(password);
    return Promise.resolve(this.leaked.has(password));
  }
}

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failWith: Error | undefined;

  send(message: MailMessage): Promise<void> {
    if (this.failWith) return Promise.reject(this.failWith);
    this.sent.push(message);
    return Promise.resolve();
  }
}

/** Counts hits like the real limiter; a rule's budget is spent for good. */
export class FakeRateLimiter implements RateLimiter {
  readonly hits: { rule: string; subject: string }[] = [];
  private readonly counters = new Map<string, number>();

  hit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    this.hits.push({ rule: rule.name, subject });
    const key = `${rule.name}:${subject}`;
    const count = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, count);
    return Promise.resolve({
      allowed: count <= rule.limit,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - count),
      resetSeconds: rule.windowSeconds,
    });
  }

  /** Forget everything counted so far (a new window). */
  reset(): void {
    this.counters.clear();
  }
}

/** The audit log and the outbox over in-memory repositories, built the way Nest would. */
export function createRecorders(clock: FakeClock, ids: FakeIds) {
  const auditEntries: Record<string, unknown>[] = [];
  const outboxMessages: { type: string; payload: Record<string, unknown> }[] = [];

  const audit = new AuditLog(
    {
      append: (entry: Record<string, unknown>) => {
        auditEntries.push(entry);
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  const outbox = new Outbox(
    {
      append: (
        message: { type: string; payload: Record<string, unknown> },
        tx?: TransactionContext,
      ) => {
        outboxMessages.push(message);
        undoLogOf(tx)?.push(() => outboxMessages.splice(outboxMessages.indexOf(message), 1));
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  return { audit, outbox, auditEntries, outboxMessages };
}
