import { beforeEach, describe, expect, it } from "vitest";

import { RateLimitExceededError } from "../../../platform/rate-limit/rate-limiter.js";
import type { EraseAccount } from "../../privacy/application/public-api.js";
import { startSession } from "../domain/session.js";
import { newSocialUser, newUser, type User } from "../domain/user.js";
import { CurrentPassword } from "./current-password.js";
import { DeleteAccount, RECENT_LOGIN_MS } from "./delete-account.js";
import {
  AccountNotFoundError,
  IncorrectPasswordError,
  PasswordRequiredError,
  ReauthenticationRequiredError,
} from "./errors.js";
import {
  FakeClock,
  FakeIds,
  FakePasswordHasher,
  FakeRateLimiter,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "./in-memory.fakes.js";

const PASSWORD = "correct horse battery";

function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const limiter = new FakeRateLimiter();
  const erased: { id: string; requestId?: string }[] = [];
  const erase = {
    execute: (holder: { id: string }, context: { requestId?: string } = {}) => {
      erased.push({ id: holder.id, ...context });
      return Promise.resolve();
    },
  } as unknown as EraseAccount;
  const currentPassword = new CurrentPassword(users, new FakePasswordHasher(), limiter);
  const deleteAccount = new DeleteAccount(users, sessions, clock, currentPassword, erase);

  async function account(kind: "password" | "social", email = "ana@exemplo.com"): Promise<User> {
    const base = { id: ids.next(), name: "Ana", email, now: clock.current };
    const user =
      kind === "password"
        ? newUser({ ...base, passwordHash: `$argon2id$fake$${PASSWORD}` })
        : newSocialUser(base);
    await users.create(user);
    return user;
  }

  async function loginOf(user: User): Promise<string> {
    const { record } = startSession({
      id: ids.next(),
      familyId: ids.next(),
      userId: user.id,
      now: clock.current,
    });
    await sessions.create(record);
    return record.familyId;
  }

  return { clock, limiter, deleteAccount, erased, account, loginOf };
}

describe("account deletion", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("erases an account with a password once the password is typed again", async () => {
    const user = await s.account("password");
    const sessionId = await s.loginOf(user);
    await s.deleteAccount.execute(
      { id: user.id, role: user.role, sessionId },
      { confirm: "EXCLUIR", password: PASSWORD },
      { requestId: "req-1" },
    );
    expect(s.erased).toEqual([{ id: user.id, requestId: "req-1" }]);
  });

  it("asks for the password of an account that has one, and refuses a wrong one", async () => {
    const user = await s.account("password");
    const owner = { id: user.id, role: user.role, sessionId: await s.loginOf(user) };
    await expect(s.deleteAccount.execute(owner, { confirm: "EXCLUIR" })).rejects.toBeInstanceOf(
      PasswordRequiredError,
    );
    await expect(
      s.deleteAccount.execute(owner, { confirm: "EXCLUIR", password: "wrong one" }),
    ).rejects.toBeInstanceOf(IncorrectPasswordError);
    expect(s.erased).toEqual([]);
  });

  it("budgets password guesses with the other re-authentications", async () => {
    const user = await s.account("password");
    const owner = { id: user.id, role: user.role, sessionId: await s.loginOf(user) };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        s.deleteAccount.execute(owner, { confirm: "EXCLUIR", password: "wrong one" }),
      ).rejects.toBeInstanceOf(IncorrectPasswordError);
    }
    await expect(
      s.deleteAccount.execute(owner, { confirm: "EXCLUIR", password: PASSWORD }),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(s.erased).toEqual([]);
  });

  it("lets an account of social login go only right after a login", async () => {
    const user = await s.account("social");
    const sessionId = await s.loginOf(user);
    const owner = { id: user.id, role: user.role, sessionId };

    s.clock.advance(RECENT_LOGIN_MS + 1);
    await expect(s.deleteAccount.execute(owner, { confirm: "EXCLUIR" })).rejects.toBeInstanceOf(
      ReauthenticationRequiredError,
    );

    // A fresh login is a new session, made just now.
    const fresh = { ...owner, sessionId: await s.loginOf(user) };
    s.clock.advance(RECENT_LOGIN_MS);
    await s.deleteAccount.execute(fresh, { confirm: "EXCLUIR" });
    expect(s.erased.map((entry) => entry.id)).toEqual([user.id]);
  });

  it("does not take a session of someone else as a recent login", async () => {
    const user = await s.account("social");
    const other = await s.account("social", "bia@exemplo.com");
    const owner = { id: user.id, role: user.role, sessionId: await s.loginOf(other) };
    await expect(s.deleteAccount.execute(owner, { confirm: "EXCLUIR" })).rejects.toBeInstanceOf(
      ReauthenticationRequiredError,
    );
  });

  it("answers that the account is gone when it no longer exists", async () => {
    const owner = { id: "0192a0e4-0000-7000-8000-00000000ffff", role: "BUYER", sessionId: "x" };
    await expect(
      s.deleteAccount.execute(owner as never, { confirm: "EXCLUIR", password: PASSWORD }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});
