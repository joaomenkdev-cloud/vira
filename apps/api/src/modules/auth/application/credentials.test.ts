import { beforeEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import { RateLimitExceededError } from "../../../platform/rate-limit/rate-limiter.js";
import { startSession } from "../domain/session.js";
import { newSocialUser, newUser, type User } from "../domain/user.js";
import { hashVerificationToken, TOKEN_TTL_MS } from "../domain/verification-token.js";
import { ChangePassword } from "./change-password.js";
import { ConfirmEmailChange } from "./confirm-email-change.js";
import { CurrentPassword } from "./current-password.js";
import {
  BreachedPasswordError,
  IncorrectPasswordError,
  InvalidTokenError,
  PasswordNotSetError,
  SameEmailError,
} from "./errors.js";
import {
  createRecorders,
  FakeBreachedPasswords,
  FakeClock,
  FakeIds,
  FakeMailer,
  FakePasswordHasher,
  FakeRateLimiter,
  FakeTransactions,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InMemoryVerificationTokenRepository,
} from "./in-memory.fakes.js";
import { NewPasswords } from "./new-passwords.js";
import { RequestEmailChange } from "./request-email-change.js";
import { RequestPasswordReset } from "./request-password-reset.js";
import { ResetPassword } from "./reset-password.js";
import { SendAccountNotices } from "./send-account-notices.js";
import { SendEmailChangeEmails } from "./send-email-change-emails.js";
import { SendPasswordResetEmail } from "./send-password-reset-email.js";

const PASSWORD = "correct horse battery";
const NEW_PASSWORD = "a brand new passphrase";
const WEB_ORIGIN = "http://localhost:3001";

function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const sessions = new InMemorySessionRepository();
  const hasher = new FakePasswordHasher();
  const breached = new FakeBreachedPasswords();
  const limiter = new FakeRateLimiter();
  const mailer = new FakeMailer();
  const transactions = new FakeTransactions();
  const recorders = createRecorders(clock, ids);
  const config = { http: { webOrigin: WEB_ORIGIN } } as AppConfig;

  const newPasswords = new NewPasswords(breached, hasher);
  const currentPassword = new CurrentPassword(users, hasher, limiter);

  const forgot = new RequestPasswordReset(users, limiter, recorders.outbox, recorders.audit);
  const reset = new ResetPassword(
    users,
    tokens,
    sessions,
    transactions,
    clock,
    newPasswords,
    recorders.outbox,
    recorders.audit,
  );
  const change = new ChangePassword(
    users,
    sessions,
    transactions,
    clock,
    currentPassword,
    newPasswords,
    recorders.outbox,
    recorders.audit,
  );
  const requestEmailChange = new RequestEmailChange(
    users,
    transactions,
    limiter,
    currentPassword,
    recorders.outbox,
    recorders.audit,
  );
  const confirmEmailChange = new ConfirmEmailChange(
    users,
    tokens,
    transactions,
    clock,
    recorders.audit,
  );
  const sendReset = new SendPasswordResetEmail(users, tokens, mailer, clock, ids, config);
  const sendEmailChange = new SendEmailChangeEmails(users, tokens, mailer, clock, ids, config);
  const notices = new SendAccountNotices(users, mailer, config);

  async function verifiedUser(email = "ana@exemplo.com"): Promise<User> {
    const user = {
      ...newUser({
        id: ids.next(),
        name: "Ana",
        email,
        passwordHash: `$argon2id$fake$${PASSWORD}`,
        now: clock.current,
      }),
      emailVerifiedAt: clock.current,
    };
    await users.create(user);
    return user;
  }

  /** A logged-in session of `user`; answers its id (the family id). */
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

  /** Runs the worker side of the queued e-mail messages, in order. */
  async function deliver(): Promise<void> {
    for (const message of recorders.outboxMessages.splice(0)) {
      const userId = message.payload["userId"] as string;
      if (message.type === "auth.password_reset_requested") await sendReset.execute(userId);
      if (message.type === "auth.email_change_requested") await sendEmailChange.execute(userId);
      if (message.type === "auth.password_changed_notice") await notices.passwordChanged(userId);
      if (message.type === "auth.email_in_use_notice") await notices.emailInUse(userId);
    }
  }

  function tokenSentTo(address: string, path: string): string {
    const mail = mailer.sent.findLast((m) => m.to === address);
    const match = new RegExp(`${path}#token=([A-Za-z0-9_-]{43})`).exec(mail?.text ?? "");
    if (!match?.[1]) throw new Error(`no ${path} link sent to ${address}`);
    return match[1];
  }

  return {
    clock,
    users,
    tokens,
    sessions,
    hasher,
    breached,
    limiter,
    mailer,
    forgot,
    reset,
    change,
    requestEmailChange,
    confirmEmailChange,
    verifiedUser,
    loginOf,
    deliver,
    tokenSentTo,
    ...recorders,
  };
}

describe("password reset", () => {
  let s: ReturnType<typeof setup>;
  let user: User;
  beforeEach(async () => {
    s = setup();
    user = await s.verifiedUser();
  });

  async function resetLink(): Promise<string> {
    await s.forgot.execute({ email: user.email });
    await s.deliver();
    return s.tokenSentTo(user.email, "/redefinir-senha");
  }

  it("e-mails a link to the account's address, with nothing but the user id queued", async () => {
    await s.forgot.execute({ email: user.email }, { requestId: "req-1" });

    expect(s.outboxMessages).toEqual([
      expect.objectContaining({
        type: "auth.password_reset_requested",
        payload: { userId: user.id },
      }),
    ]);
    expect(s.auditEntries).toEqual([
      expect.objectContaining({ action: "auth.password_reset_requested", entityId: user.id }),
    ]);

    await s.deliver();
    const [mail] = s.mailer.sent;
    expect(mail).toMatchObject({ to: user.email, subject: "Redefina sua senha na Vira" });
    expect(mail?.text).toContain(`${WEB_ORIGIN}/redefinir-senha#token=`);
  });

  it("does nothing for an unknown address, without failing", async () => {
    await s.forgot.execute({ email: "ninguem@exemplo.com" });
    expect(s.outboxMessages).toEqual([]);
    expect(s.auditEntries).toEqual([]);
  });

  it("silently stops sending after three requests an hour for one address", async () => {
    for (let i = 0; i < 5; i++) await s.forgot.execute({ email: user.email });
    expect(s.outboxMessages).toHaveLength(3);
    // Unknown addresses spend the same budget, so it reveals nothing.
    expect(s.limiter.hits.every((hit) => hit.rule === "auth.forgot_password.account")).toBe(true);
  });

  it("sets the new password, ends every session and queues a notice", async () => {
    const token = await resetLink();
    const sessionA = await s.loginOf(user);
    const sessionB = await s.loginOf(user);

    await s.reset.execute({ token, password: NEW_PASSWORD });

    expect(s.users.get(user.id).passwordHash).toBe(`$argon2id$fake$${NEW_PASSWORD}`);
    for (const row of [...s.sessions.family(sessionA), ...s.sessions.family(sessionB)]) {
      expect(row.revokedAt).toEqual(s.clock.current);
      expect(s.sessions.revokeReasons.get(row.id)).toBe("PASSWORD_CHANGED");
    }
    expect(s.outboxMessages.map((m) => m.type)).toEqual(["auth.password_changed_notice"]);
    expect(s.auditEntries.at(-1)).toMatchObject({
      action: "auth.password_changed",
      entityId: user.id,
      metadata: { via: "reset" },
    });

    await s.deliver();
    expect(s.mailer.sent.at(-1)).toMatchObject({
      to: user.email,
      subject: "Sua senha na Vira foi alterada",
    });
  });

  it("works once: the same link is refused afterwards", async () => {
    const token = await resetLink();
    await s.reset.execute({ token, password: NEW_PASSWORD });
    await expect(s.reset.execute({ token, password: "yet another one!" })).rejects.toThrow(
      InvalidTokenError,
    );
    expect(s.users.get(user.id).passwordHash).toBe(`$argon2id$fake$${NEW_PASSWORD}`);
  });

  it("refuses an expired link (30 minutes) and an unknown one", async () => {
    const token = await resetLink();
    s.clock.advance(TOKEN_TTL_MS.PASSWORD_RESET + 1);
    await expect(s.reset.execute({ token, password: NEW_PASSWORD })).rejects.toThrow(
      InvalidTokenError,
    );
    await expect(
      s.reset.execute({ token: "x".repeat(43), password: NEW_PASSWORD }),
    ).rejects.toThrow(InvalidTokenError);
    expect(s.users.get(user.id).passwordHash).toBe(`$argon2id$fake$${PASSWORD}`);
  });

  it("only honours the newest link", async () => {
    const first = await resetLink();
    const second = await resetLink();
    await expect(s.reset.execute({ token: first, password: NEW_PASSWORD })).rejects.toThrow(
      InvalidTokenError,
    );
    await s.reset.execute({ token: second, password: NEW_PASSWORD });
  });

  it("does not take an e-mail verification token, nor an e-mail change one", async () => {
    await s.forgot.execute({ email: user.email });
    await s.deliver();
    const token = s.tokenSentTo(user.email, "/redefinir-senha");
    // Re-label the stored token as another purpose: it must stop working for a reset.
    for (const t of s.tokens.tokens) {
      if (t.tokenHash.equals(hashVerificationToken(token))) {
        Object.assign(t, { purpose: "EMAIL_VERIFICATION" });
      }
    }
    await expect(s.reset.execute({ token, password: NEW_PASSWORD })).rejects.toThrow(
      InvalidTokenError,
    );
  });

  it("refuses a leaked password without spending the link", async () => {
    const token = await resetLink();
    await expect(s.reset.execute({ token, password: "password123" })).rejects.toThrow(
      BreachedPasswordError,
    );
    expect(s.hasher.hashCalls).toBe(0);
    await s.reset.execute({ token, password: NEW_PASSWORD });
  });

  it("ends a lockout and verifies an account that never was (the link proves the address)", async () => {
    const unverified = {
      ...newUser({
        id: "0192a0e4-0000-7000-8000-00000000aaaa",
        name: "Bia",
        email: "bia@exemplo.com",
        passwordHash: "$argon2id$fake$whatever123",
        now: s.clock.current,
      }),
      failedLoginCount: 7,
      lockedUntil: new Date(s.clock.current.getTime() + 60_000),
    };
    await s.users.create(unverified);
    await s.forgot.execute({ email: unverified.email });
    await s.deliver();

    await s.reset.execute({
      token: s.tokenSentTo(unverified.email, "/redefinir-senha"),
      password: NEW_PASSWORD,
    });

    expect(s.users.get(unverified.id)).toMatchObject({
      emailVerifiedAt: s.clock.current,
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it("gives an account that only used social login its first password", async () => {
    const social = newSocialUser({
      id: "0192a0e4-0000-7000-8000-00000000bbbb",
      name: "Caio",
      email: "caio@exemplo.com",
      now: s.clock.current,
    });
    await s.users.create(social);
    await s.forgot.execute({ email: social.email });
    await s.deliver();

    await s.reset.execute({
      token: s.tokenSentTo(social.email, "/redefinir-senha"),
      password: NEW_PASSWORD,
    });
    expect(s.users.get(social.id).passwordHash).toBe(`$argon2id$fake$${NEW_PASSWORD}`);
  });
});

describe("password change", () => {
  let s: ReturnType<typeof setup>;
  let user: User;
  let current: string;
  beforeEach(async () => {
    s = setup();
    user = await s.verifiedUser();
    current = await s.loginOf(user);
  });
  const owner = () => ({ id: user.id, role: user.role, sessionId: current });

  it("replaces the password and ends the other sessions, keeping this one", async () => {
    const other = await s.loginOf(user);

    await s.change.execute(owner(), { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(s.users.get(user.id).passwordHash).toBe(`$argon2id$fake$${NEW_PASSWORD}`);
    expect(s.sessions.family(current).every((row) => row.revokedAt === null)).toBe(true);
    expect(s.sessions.family(other).every((row) => row.revokedAt !== null)).toBe(true);
    expect(s.sessions.revokeReasons.get(s.sessions.family(other)[0]?.id ?? "")).toBe(
      "PASSWORD_CHANGED",
    );
    expect(s.outboxMessages.map((m) => m.type)).toEqual(["auth.password_changed_notice"]);
    expect(s.auditEntries.at(-1)).toMatchObject({
      action: "auth.password_changed",
      metadata: { via: "change" },
      actorId: user.id,
    });
  });

  it("refuses a wrong current password and changes nothing", async () => {
    const other = await s.loginOf(user);
    await expect(
      s.change.execute(owner(), { currentPassword: "not it", newPassword: NEW_PASSWORD }),
    ).rejects.toThrow(IncorrectPasswordError);
    expect(s.users.get(user.id).passwordHash).toBe(`$argon2id$fake$${PASSWORD}`);
    expect(s.sessions.family(other).every((row) => row.revokedAt === null)).toBe(true);
    expect(s.outboxMessages).toEqual([]);
  });

  it("budgets guesses at the current password per account, before any hash", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(
        s.change.execute(owner(), { currentPassword: `guess ${i}`, newPassword: NEW_PASSWORD }),
      ).rejects.toThrow(IncorrectPasswordError);
    }
    const verifies = s.hasher.verifyTargets.length;
    await expect(
      s.change.execute(owner(), { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }),
    ).rejects.toThrow(RateLimitExceededError);
    expect(s.hasher.verifyTargets).toHaveLength(verifies);
  });

  it("refuses a leaked new password", async () => {
    await expect(
      s.change.execute(owner(), { currentPassword: PASSWORD, newPassword: "senha12345" }),
    ).rejects.toThrow(BreachedPasswordError);
    expect(s.users.get(user.id).passwordHash).toBe(`$argon2id$fake$${PASSWORD}`);
  });

  it("refuses an account without a password: it has none to confirm", async () => {
    s.users.users.set(user.id, { ...user, passwordHash: null });
    await expect(
      s.change.execute(owner(), { currentPassword: "anything", newPassword: NEW_PASSWORD }),
    ).rejects.toThrow(PasswordNotSetError);
  });
});

describe("e-mail change", () => {
  let s: ReturnType<typeof setup>;
  let user: User;
  let current: string;
  const NEW_EMAIL = "ana.nova@exemplo.com";
  beforeEach(async () => {
    s = setup();
    user = await s.verifiedUser();
    current = await s.loginOf(user);
  });
  const owner = () => ({ id: user.id, role: user.role, sessionId: current });

  async function requestAndDeliver(email = NEW_EMAIL): Promise<string> {
    await s.requestEmailChange.execute(owner(), { email, currentPassword: PASSWORD });
    await s.deliver();
    return s.tokenSentTo(email, "/confirmar-email");
  }

  it("keeps the address until the link sent to the new one is used", async () => {
    const token = await requestAndDeliver();

    expect(s.users.get(user.id)).toMatchObject({ email: user.email, pendingEmail: NEW_EMAIL });
    // The current address is told, without a link.
    const notice = s.mailer.sent.find((m) => m.to === user.email);
    expect(notice?.subject).toBe("Pedido de troca de e-mail na sua conta da Vira");
    expect(notice?.text).not.toContain("#token=");

    await s.confirmEmailChange.execute({ token });
    expect(s.users.get(user.id)).toMatchObject({
      email: NEW_EMAIL,
      pendingEmail: null,
      emailVerifiedAt: s.clock.current,
    });
    expect(s.auditEntries.map((e) => e["action"])).toEqual([
      "auth.email_change_requested",
      "auth.email_changed",
    ]);
    // Sessions stay open: the access token carries no e-mail.
    expect(s.sessions.family(current).every((row) => row.revokedAt === null)).toBe(true);
  });

  it("works once", async () => {
    const token = await requestAndDeliver();
    await s.confirmEmailChange.execute({ token });
    await expect(s.confirmEmailChange.execute({ token })).rejects.toThrow(InvalidTokenError);
  });

  it("voids the link of an earlier request for another address", async () => {
    const first = await requestAndDeliver("primeiro@exemplo.com");
    const second = await requestAndDeliver("segundo@exemplo.com");

    await expect(s.confirmEmailChange.execute({ token: first })).rejects.toThrow(InvalidTokenError);
    await s.confirmEmailChange.execute({ token: second });
    expect(s.users.get(user.id).email).toBe("segundo@exemplo.com");
  });

  it("never moves to an address other than the one the link went to", async () => {
    const first = await requestAndDeliver("primeiro@exemplo.com");
    // A second request whose e-mail has not gone out yet: the old link is still stored.
    await s.requestEmailChange.execute(owner(), {
      email: "segundo@exemplo.com",
      currentPassword: PASSWORD,
    });
    await expect(s.confirmEmailChange.execute({ token: first })).rejects.toThrow(InvalidTokenError);
    expect(s.users.get(user.id).email).toBe(user.email);
  });

  it("answers the same for an address that has an account, and tells its owner instead", async () => {
    const other = await s.verifiedUser("bia@exemplo.com");

    await s.requestEmailChange.execute(owner(), { email: other.email, currentPassword: PASSWORD });

    expect(s.users.get(user.id).pendingEmail).toBeNull();
    expect(s.outboxMessages).toEqual([
      expect.objectContaining({ type: "auth.email_in_use_notice", payload: { userId: other.id } }),
    ]);
    await s.deliver();
    expect(s.mailer.sent).toEqual([
      expect.objectContaining({ to: other.email, subject: "Tentativa de usar seu e-mail na Vira" }),
    ]);
  });

  it("refuses the link when another account took the address meanwhile", async () => {
    const token = await requestAndDeliver();
    await s.verifiedUser(NEW_EMAIL);

    await expect(s.confirmEmailChange.execute({ token })).rejects.toThrow(InvalidTokenError);
    expect(s.users.get(user.id).email).toBe(user.email);
  });

  it("requires the current password, and refuses the current address", async () => {
    await expect(
      s.requestEmailChange.execute(owner(), { email: NEW_EMAIL, currentPassword: "nope" }),
    ).rejects.toThrow(IncorrectPasswordError);
    await expect(
      s.requestEmailChange.execute(owner(), { email: user.email, currentPassword: PASSWORD }),
    ).rejects.toThrow(SameEmailError);
    expect(s.outboxMessages).toEqual([]);
  });

  it("sends at most three requests' e-mails an hour", async () => {
    for (let i = 0; i < 3; i++) {
      await s.requestEmailChange.execute(owner(), {
        email: `n${i}@exemplo.com`,
        currentPassword: PASSWORD,
      });
    }
    await expect(
      s.requestEmailChange.execute(owner(), { email: "n9@exemplo.com", currentPassword: PASSWORD }),
    ).rejects.toThrow(RateLimitExceededError);
    expect(s.outboxMessages).toHaveLength(3);
  });

  it("expires after 24 hours", async () => {
    const token = await requestAndDeliver();
    s.clock.advance(TOKEN_TTL_MS.EMAIL_CHANGE + 1);
    await expect(s.confirmEmailChange.execute({ token })).rejects.toThrow(InvalidTokenError);
  });
});
