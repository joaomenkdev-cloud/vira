import { beforeEach, describe, expect, it } from "vitest";

import type {
  TransactionContext,
  TransactionRunner,
} from "../../../platform/database/transaction.js";
import { AuditLog } from "../../audit/application/public-api.js";
import type { Account, OrganizerProfile } from "../domain/account.js";
import { BecomeOrganizer } from "./become-organizer.js";
import { AccountNotFoundError, AlreadyOrganizerError } from "./errors.js";
import { GetAccount } from "./get-account.js";
import type { AccountRepository, CreateProfileOutcome } from "./ports/account-repository.js";
import { UpdateProfile } from "./update-profile.js";

/** In-memory accounts with the uniqueness rules of the real tables. */
class InMemoryAccounts implements AccountRepository {
  readonly accounts = new Map<string, Account>();
  readonly profiles: OrganizerProfile[] = [];

  findById(id: string): Promise<Account | null> {
    const account = this.accounts.get(id);
    if (!account) return Promise.resolve(null);
    const organizer = this.profiles.find((p) => p.userId === id) ?? null;
    return Promise.resolve({ ...account, organizer });
  }

  rename(id: string, name: string): Promise<boolean> {
    const account = this.accounts.get(id);
    if (!account) return Promise.resolve(false);
    this.accounts.set(id, { ...account, name });
    return Promise.resolve(true);
  }

  createOrganizerProfile(profile: OrganizerProfile): Promise<CreateProfileOutcome> {
    if (this.profiles.some((p) => p.userId === profile.userId)) {
      return Promise.resolve("account-has-profile");
    }
    if (this.profiles.some((p) => p.slug === profile.slug)) return Promise.resolve("slug-taken");
    this.profiles.push(profile);
    return Promise.resolve("created");
  }

  promoteToOrganizer(userId: string): Promise<void> {
    const account = this.accounts.get(userId);
    if (account?.role === "BUYER") this.accounts.set(userId, { ...account, role: "ORGANIZER" });
    return Promise.resolve();
  }
}

function setup() {
  const clock = { current: new Date("2026-10-15T12:00:00Z"), now: () => clock.current };
  let n = 0;
  const ids = { next: () => `0192a0e4-0000-7000-8000-${String(++n).padStart(12, "0")}` };
  const accounts = new InMemoryAccounts();
  const transactions: TransactionRunner = {
    run: <T>(work: (tx: TransactionContext) => Promise<T>) => work({} as TransactionContext),
  };
  const auditEntries: Record<string, unknown>[] = [];
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
  const getAccount = new GetAccount(accounts);
  const updateProfile = new UpdateProfile(accounts, getAccount);
  const becomeOrganizer = new BecomeOrganizer(accounts, transactions, clock, ids, audit);

  function addAccount(overrides: Partial<Account> = {}): Account {
    const account: Account = {
      id: ids.next(),
      name: "Ana Souza",
      email: "ana@exemplo.com",
      role: "BUYER",
      emailVerified: true,
      hasPassword: true,
      organizer: null,
      ...overrides,
    };
    accounts.accounts.set(account.id, account);
    return account;
  }

  return { accounts, getAccount, updateProfile, becomeOrganizer, auditEntries, addAccount };
}

describe("account", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("shows the caller's account and nobody else's", async () => {
    const ana = s.addAccount();
    s.addAccount({ name: "Bia", email: "bia@exemplo.com" });

    expect(await s.getAccount.execute(ana.id)).toMatchObject({ id: ana.id, name: "Ana Souza" });
    await expect(s.getAccount.execute("0192a0e4-0000-7000-8000-999999999999")).rejects.toThrow(
      AccountNotFoundError,
    );
  });

  it("renames the account and answers with it", async () => {
    const ana = s.addAccount();
    expect(await s.updateProfile.execute(ana.id, { name: "Ana S." })).toMatchObject({
      name: "Ana S.",
      role: "BUYER",
      email: ana.email,
    });
  });

  it("refuses to rename an account that is gone", async () => {
    await expect(
      s.updateProfile.execute("0192a0e4-0000-7000-8000-999999999999", { name: "X" }),
    ).rejects.toThrow(AccountNotFoundError);
  });
});

describe("BecomeOrganizer", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it("creates the profile with a slug from the name and makes a BUYER an ORGANIZER", async () => {
    const ana = s.addAccount();

    const profile = await s.becomeOrganizer.execute(
      { id: ana.id, role: "BUYER" },
      { displayName: "Coletivo São João" },
      { requestId: "req-1" },
    );

    expect(profile).toMatchObject({
      userId: ana.id,
      displayName: "Coletivo São João",
      slug: "coletivo-sao-joao",
    });
    expect((await s.getAccount.execute(ana.id)).role).toBe("ORGANIZER");
    expect(s.auditEntries).toEqual([
      expect.objectContaining({
        action: "user.organizer_profile_created",
        entityId: ana.id,
        actorId: ana.id,
        actorRole: "BUYER",
        requestId: "req-1",
      }),
    ]);
  });

  it("keeps an ADMIN an ADMIN", async () => {
    const admin = s.addAccount({ role: "ADMIN" });
    await s.becomeOrganizer.execute({ id: admin.id, role: "ADMIN" }, { displayName: "Equipe" });
    expect((await s.getAccount.execute(admin.id)).role).toBe("ADMIN");
  });

  it("refuses a second profile", async () => {
    const ana = s.addAccount();
    await s.becomeOrganizer.execute({ id: ana.id, role: "BUYER" }, { displayName: "Um" });
    await expect(
      s.becomeOrganizer.execute({ id: ana.id, role: "ORGANIZER" }, { displayName: "Dois" }),
    ).rejects.toThrow(AlreadyOrganizerError);
    expect(s.accounts.profiles).toHaveLength(1);
  });

  it("refuses when a concurrent request created the profile first", async () => {
    const ana = s.addAccount();
    // The lookup still sees no profile; the insert then finds one.
    const findById = s.accounts.findById.bind(s.accounts);
    s.accounts.findById = async (id) => {
      const account = await findById(id);
      return account && { ...account, organizer: null };
    };
    s.accounts.profiles.push({
      id: "p",
      userId: ana.id,
      displayName: "Outro",
      slug: "outro",
      createdAt: new Date(),
    });

    await expect(
      s.becomeOrganizer.execute({ id: ana.id, role: "BUYER" }, { displayName: "Um" }),
    ).rejects.toThrow(AlreadyOrganizerError);
  });

  it("picks the next free slug when the name is taken", async () => {
    const names = ["Vira", "Vira", "vira!", "VIRA", "Virá", "Vira", "Vira"];
    const slugs: string[] = [];
    for (const displayName of names) {
      const account = s.addAccount();
      slugs.push(
        (await s.becomeOrganizer.execute({ id: account.id, role: "BUYER" }, { displayName })).slug,
      );
    }
    expect(slugs.slice(0, 5)).toEqual(["vira", "vira-2", "vira-3", "vira-4", "vira-5"]);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs.slice(5)) expect(slug).toMatch(/^vira-[0-9a-f]{6}$/);
  });

  it("refuses an account that is gone", async () => {
    await expect(
      s.becomeOrganizer.execute(
        { id: "0192a0e4-0000-7000-8000-999999999999", role: "BUYER" },
        { displayName: "X" },
      ),
    ).rejects.toThrow(AccountNotFoundError);
  });
});
