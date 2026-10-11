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
import { isLocked, type User } from "../domain/user.js";
import type { TokenPurpose, VerificationToken } from "../domain/verification-token.js";
import type { PasswordHasher } from "./ports/password-hasher.js";
import { EmailAlreadyRegisteredError, type UserRepository } from "./ports/user-repository.js";
import type { VerificationTokenRepository } from "./ports/verification-token-repository.js";

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
  ): Promise<{ userId: string } | null> {
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
    return Promise.resolve({ userId: token.userId });
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
