import { beforeEach, describe, expect, it, vi } from "vitest";

import { newUser } from "../domain/user.js";
import { BreachedPasswordError } from "./errors.js";
import {
  createRecorders,
  FakeBreachedPasswords,
  FakeClock,
  FakeIds,
  FakePasswordHasher,
  FakeTransactions,
  InMemoryUserRepository,
} from "./in-memory.fakes.js";
import { NewPasswords } from "./new-passwords.js";
import { RegisterUser } from "./register-user.js";

const request = { name: "Ana Souza", email: "ana@exemplo.com", password: "correct horse battery" };

function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const breached = new FakeBreachedPasswords();
  const recorders = createRecorders(clock, ids);
  const register = new RegisterUser(
    users,
    new FakeTransactions(),
    clock,
    ids,
    new NewPasswords(breached, hasher),
    recorders.outbox,
    recorders.audit,
  );
  return { clock, ids, users, hasher, breached, register, ...recorders };
}

describe("RegisterUser", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  describe("for a new e-mail", () => {
    it("creates an unverified BUYER with a hashed password", async () => {
      await s.register.execute(request);

      const [user] = [...s.users.users.values()];
      expect(s.users.users.size).toBe(1);
      expect(user).toMatchObject({
        email: "ana@exemplo.com",
        name: "Ana Souza",
        role: "BUYER",
        emailVerifiedAt: null,
        createdAt: s.clock.current,
      });
      expect(user?.passwordHash).toBe("$argon2id$fake$correct horse battery");
    });

    it("asks for the verification e-mail with nothing but the user id", async () => {
      await s.register.execute(request);

      const [user] = [...s.users.users.values()];
      expect(s.outboxMessages.map((m) => ({ type: m.type, payload: m.payload }))).toEqual([
        { type: "auth.verification_email_requested", payload: { userId: user?.id } },
      ]);
    });

    it("audits the registration without personal data", async () => {
      await s.register.execute(request, { requestId: "req-12345678" });

      const [user] = [...s.users.users.values()];
      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.registered",
          entityId: user?.id,
          requestId: "req-12345678",
          metadata: {},
        }),
      ]);
      const everything = JSON.stringify([s.auditEntries, s.outboxMessages]);
      for (const secret of ["ana@exemplo.com", "Ana Souza", "correct horse"]) {
        expect(everything).not.toContain(secret);
      }
    });

    it("saves the account and the e-mail request together or not at all", async () => {
      vi.spyOn(s.outbox, "publish").mockRejectedValueOnce(new Error("outbox down"));

      await expect(s.register.execute(request)).rejects.toThrow("outbox down");

      expect(s.users.users.size).toBe(0);
      expect(s.outboxMessages).toEqual([]);
    });
  });

  describe("for an e-mail that already has an account", () => {
    let existingId: string;

    beforeEach(async () => {
      const existing = newUser({
        id: s.ids.next(),
        name: "Ana Antiga",
        email: "ana@exemplo.com",
        passwordHash: "$argon2id$fake$old password",
        now: s.clock.current,
      });
      existingId = existing.id;
      await s.users.create(existing);
    });

    it("changes nothing about the account and only sends the notice", async () => {
      const before = s.users.get(existingId);

      await s.register.execute({ ...request, name: "Outra Pessoa" });

      expect(s.users.users.size).toBe(1);
      expect(s.users.get(existingId)).toEqual(before);
      expect(s.outboxMessages.map((m) => ({ type: m.type, payload: m.payload }))).toEqual([
        { type: "auth.account_exists_notice", payload: { userId: existingId } },
      ]);
      expect(s.auditEntries).toEqual([]);
    });

    it("hashes the password just as it does for a new e-mail, so the timing matches", async () => {
      await s.register.execute(request);

      expect(s.hasher.hashCalls).toBe(1);
    });

    it("finds the account whatever the case of the typed address (already normalized)", async () => {
      // The schema lower-cases before the use case runs; this checks the lookup key is used as is.
      await s.register.execute({ ...request, email: "ana@exemplo.com" });
      expect(s.outboxMessages).toHaveLength(1);
    });
  });

  it("treats a simultaneous registration of the same e-mail as a known address", async () => {
    // The lookup finds nothing, but another request inserts the address before ours does.
    const rival = newUser({
      id: s.ids.next(),
      name: "Rival",
      email: "ana@exemplo.com",
      passwordHash: "$argon2id$fake$x",
      now: s.clock.current,
    });
    vi.spyOn(s.users, "findByEmail").mockResolvedValueOnce(null);
    await s.users.create(rival);

    await expect(s.register.execute(request)).resolves.toBeUndefined();

    expect(s.users.users.size).toBe(1);
    expect(s.outboxMessages.map((m) => m.type)).toEqual(["auth.account_exists_notice"]);
    expect(s.outboxMessages[0]?.payload).toEqual({ userId: rival.id });
  });

  it("answers the same for a new and for a known address", async () => {
    await expect(s.register.execute(request)).resolves.toBeUndefined();
    await expect(s.register.execute(request)).resolves.toBeUndefined();
  });
  describe("leaked passwords", () => {
    it("refuses one before hashing or creating anything", async () => {
      await expect(s.register.execute({ ...request, password: "password123" })).rejects.toThrow(
        BreachedPasswordError,
      );
      expect(s.hasher.hashCalls).toBe(0);
      expect(s.users.users.size).toBe(0);
      expect(s.outboxMessages).toEqual([]);
    });

    it("refuses one for an already registered e-mail too, so the answer reveals nothing", async () => {
      await s.register.execute(request);
      s.outboxMessages.length = 0;

      await expect(s.register.execute({ ...request, password: "password123" })).rejects.toThrow(
        BreachedPasswordError,
      );
      expect(s.outboxMessages).toEqual([]);
    });

    it("checks every password, new e-mail or not", async () => {
      await s.register.execute(request);
      await s.register.execute(request);
      expect(s.breached.checked).toEqual([request.password, request.password]);
    });
  });
});
