import { beforeEach, describe, expect, it, vi } from "vitest";

import { newUser } from "../domain/user.js";
import { issueVerificationToken, TOKEN_TTL_MS } from "../domain/verification-token.js";
import { InvalidTokenError } from "./errors.js";
import {
  createRecorders,
  FakeClock,
  FakeIds,
  FakeTransactions,
  InMemoryUserRepository,
  InMemoryVerificationTokenRepository,
} from "./in-memory.fakes.js";
import { VerifyEmail } from "./verify-email.js";

async function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const tokens = new InMemoryVerificationTokenRepository();
  const recorders = createRecorders(clock, ids);
  const verify = new VerifyEmail(users, tokens, new FakeTransactions(), clock, recorders.audit);

  const user = newUser({
    id: ids.next(),
    name: "Ana Souza",
    email: "ana@exemplo.com",
    passwordHash: "$argon2id$fake$x",
    now: clock.current,
  });
  await users.create(user);
  const { secret, record } = issueVerificationToken({
    id: ids.next(),
    userId: user.id,
    purpose: "EMAIL_VERIFICATION",
    now: clock.current,
  });
  await tokens.replaceUnused(record);
  return { clock, users, tokens, verify, user, secret, ...recorders };
}

describe("VerifyEmail", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("verifies the address and answers with the public user", async () => {
    const user = await s.verify.execute({ token: s.secret });

    expect(user).toEqual({
      id: s.user.id,
      name: "Ana Souza",
      email: "ana@exemplo.com",
      role: "BUYER",
      emailVerified: true,
    });
    expect(s.users.get(s.user.id).emailVerifiedAt).toEqual(s.clock.current);
  });

  it("audits it as the user, without personal data", async () => {
    await s.verify.execute({ token: s.secret }, { requestId: "req-12345678" });

    expect(s.auditEntries).toEqual([
      expect.objectContaining({
        action: "auth.email_verified",
        actorId: s.user.id,
        entityId: s.user.id,
        requestId: "req-12345678",
        metadata: {},
      }),
    ]);
  });

  it("works once: the same link used again is refused", async () => {
    await s.verify.execute({ token: s.secret });

    await expect(s.verify.execute({ token: s.secret })).rejects.toBeInstanceOf(InvalidTokenError);
    expect(s.auditEntries).toHaveLength(1);
  });

  it("refuses an expired token, the instant it expires", async () => {
    s.clock.advance(TOKEN_TTL_MS.EMAIL_VERIFICATION);

    await expect(s.verify.execute({ token: s.secret })).rejects.toBeInstanceOf(InvalidTokenError);
    expect(s.users.get(s.user.id).emailVerifiedAt).toBeNull();
  });

  it("still accepts the token one millisecond before it expires", async () => {
    s.clock.advance(TOKEN_TTL_MS.EMAIL_VERIFICATION - 1);

    await expect(s.verify.execute({ token: s.secret })).resolves.toMatchObject({
      emailVerified: true,
    });
  });

  it("refuses a token it never issued, in the same way", async () => {
    const stranger = "A".repeat(43);

    await expect(s.verify.execute({ token: stranger })).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("refuses a password-reset token as an e-mail verification token", async () => {
    const { secret, record } = issueVerificationToken({
      id: "0192a0e4-0000-7000-8000-0000000000ff",
      userId: s.user.id,
      purpose: "PASSWORD_RESET",
      now: s.clock.current,
    });
    await s.tokens.replaceUnused(record);

    await expect(s.verify.execute({ token: secret })).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("does not spend the token when verifying the address fails", async () => {
    vi.spyOn(s.users, "markEmailVerified").mockRejectedValueOnce(new Error("database down"));

    await expect(s.verify.execute({ token: s.secret })).rejects.toThrow("database down");

    await expect(s.verify.execute({ token: s.secret })).resolves.toMatchObject({
      emailVerified: true,
    });
  });
});
