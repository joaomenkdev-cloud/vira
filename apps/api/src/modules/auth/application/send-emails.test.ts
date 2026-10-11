import { beforeEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import { newUser, type User } from "../domain/user.js";
import { hashVerificationToken } from "../domain/verification-token.js";
import {
  FakeClock,
  FakeIds,
  FakeMailer,
  InMemoryUserRepository,
  InMemoryVerificationTokenRepository,
} from "./in-memory.fakes.js";
import { SendAccountExistsNotice } from "./send-account-exists-notice.js";
import { SendVerificationEmail } from "./send-verification-email.js";

const config = { http: { webOrigin: "https://vira.example" } } as AppConfig;

async function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const mailer = new FakeMailer();
  const user: User = newUser({
    id: ids.next(),
    name: "Ana Souza",
    email: "ana@exemplo.com",
    passwordHash: "$argon2id$fake$x",
    now: clock.current,
  });
  await users.create(user);
  return {
    clock,
    users,
    tokens,
    mailer,
    user,
    sendVerification: new SendVerificationEmail(users, tokens, mailer, clock, ids, config),
    sendNotice: new SendAccountExistsNotice(users, mailer, config),
  };
}

/** The token in the e-mail's link, as a person clicking it would send it. */
function tokenIn(text: string): string {
  const match = /\/verificar-email#token=([A-Za-z0-9_-]{43})/.exec(text);
  if (!match?.[1]) throw new Error("no verification link in the e-mail");
  return match[1];
}

describe("SendVerificationEmail", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("sends the link to the account's address, in Portuguese", async () => {
    await s.sendVerification.execute(s.user.id);

    expect(s.mailer.sent).toHaveLength(1);
    const [mail] = s.mailer.sent;
    expect(mail).toMatchObject({ to: "ana@exemplo.com", subject: "Confirme seu e-mail na Vira" });
    expect(mail?.text).toContain("Olá, Ana Souza!");
    expect(mail?.text).toContain("https://vira.example/verificar-email#token=");
  });

  it("stores only the hash of the token it mailed", async () => {
    await s.sendVerification.execute(s.user.id);

    const secret = tokenIn(s.mailer.sent[0]?.text ?? "");
    expect(s.tokens.tokens).toHaveLength(1);
    expect(s.tokens.tokens[0]?.tokenHash.equals(hashVerificationToken(secret))).toBe(true);
    expect(JSON.stringify(s.tokens.tokens)).not.toContain(secret);
  });

  it("keeps only the newest link working when the job is retried", async () => {
    await s.sendVerification.execute(s.user.id);
    await s.sendVerification.execute(s.user.id);

    const [first, second] = s.mailer.sent.map((mail) => tokenIn(mail.text));
    const now = s.clock.current;
    expect(first).not.toBe(second);
    expect(
      await s.tokens.consume(hashVerificationToken(first ?? ""), "EMAIL_VERIFICATION", now),
    ).toBeNull();
    expect(
      await s.tokens.consume(hashVerificationToken(second ?? ""), "EMAIL_VERIFICATION", now),
    ).toEqual({ userId: s.user.id });
  });

  it("does nothing for an account that is gone or already verified", async () => {
    await s.sendVerification.execute("0192a0e4-0000-7000-8000-00000000dead");
    s.users.users.set(s.user.id, { ...s.user, emailVerifiedAt: s.clock.current });
    await s.sendVerification.execute(s.user.id);

    expect(s.mailer.sent).toEqual([]);
    expect(s.tokens.tokens).toEqual([]);
  });

  it("fails, so the queue retries, when the mail server refuses", async () => {
    s.mailer.failWith = new Error("mail server down");

    await expect(s.sendVerification.execute(s.user.id)).rejects.toThrow("mail server down");
  });
});

describe("SendAccountExistsNotice", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("tells the owner they already have an account, with a way in and no token", async () => {
    await s.sendNotice.execute(s.user.id);

    const [mail] = s.mailer.sent;
    expect(mail).toMatchObject({ to: "ana@exemplo.com", subject: "Você já tem uma conta na Vira" });
    expect(mail?.text).toContain("https://vira.example/entrar");
    expect(mail?.text).not.toContain("token");
    expect(s.tokens.tokens).toEqual([]);
  });

  it("does nothing for an account that is gone", async () => {
    await s.sendNotice.execute("0192a0e4-0000-7000-8000-00000000dead");

    expect(s.mailer.sent).toEqual([]);
  });
});
