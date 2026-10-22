import { describe, expect, it } from "vitest";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import {
  RateLimitExceededError,
  type RateLimitRule,
} from "../../../platform/rate-limit/rate-limiter.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { ApplyRetention } from "./apply-retention.js";
import { EraseAccount } from "./erase-account.js";
import { AccountNotFoundError, OrganizerHasUpcomingEventsError } from "./errors.js";
import { ExportAccountData } from "./export-account-data.js";
import type { AccountData, ErasureResult, PrivacyRepository } from "./ports/privacy-repository.js";

const NOW = new Date("2026-10-22T12:00:00.000Z");
const HOLDER = { id: "0192a0e4-0000-7000-8000-000000000001", role: "BUYER" } as const;

const DATA: AccountData = {
  account: {
    id: HOLDER.id,
    email: "ana@exemplo.com",
    pendingEmail: null,
    name: "Ana Souza",
    role: "BUYER",
    hasPassword: true,
    emailVerifiedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
  },
  socialLogins: [],
  sessions: [],
  organizerProfile: null,
  orders: [],
  tickets: [],
};

function setup(erasure: ErasureResult = "erased") {
  const clock = { now: () => NOW };
  let n = 0;
  const ids = { next: () => `0192a0e4-0000-7000-8000-${String(++n).padStart(12, "0")}` };
  const audited: { action: string; actorId: string | null; requestId: string | null }[] = [];
  const audit = new AuditLog(
    {
      append: (entry: { action: string; actorId: string | null; requestId: string | null }) => {
        audited.push({ action: entry.action, actorId: entry.actorId, requestId: entry.requestId });
        return Promise.resolve();
      },
    },
    clock,
    ids,
  );
  const counts = new Map<string, number>();
  const limiter = {
    hit: (rule: RateLimitRule, subject: string) => {
      const count = (counts.get(`${rule.name}:${subject}`) ?? 0) + 1;
      counts.set(`${rule.name}:${subject}`, count);
      return Promise.resolve({
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        resetSeconds: rule.windowSeconds,
      });
    },
  };
  const calls: string[] = [];
  const repository: PrivacyRepository = {
    exportOf: (userId) => Promise.resolve(userId === HOLDER.id ? DATA : null),
    erase: (userId, now) => {
      calls.push(`erase ${userId} ${now.toISOString()}`);
      return Promise.resolve(erasure);
    },
    applyRetention: (cutoffs) => {
      calls.push(`retention ${cutoffs.eventsEndedBefore.toISOString()}`);
      return Promise.resolve({
        holdersAnonymized: 0,
        checkinAttemptsPurged: 0,
        sessionsPurged: 0,
        tokensPurged: 0,
        ordersAnonymized: 0,
        webhookEventsPurged: 0,
      });
    },
  };
  const transactions = {
    run: <T>(work: (tx: TransactionContext) => Promise<T>) => work({} as TransactionContext),
  };
  return {
    audited,
    calls,
    exportData: new ExportAccountData(repository, limiter, clock, audit),
    erase: new EraseAccount(repository, transactions, clock, audit),
    retention: new ApplyRetention(repository, clock),
  };
}

describe("data export", () => {
  it("wraps the account's data in a versioned envelope and audits it", async () => {
    const s = setup();
    const file = await s.exportData.execute(HOLDER, { requestId: "req-1" });
    expect(file).toEqual({
      format: "vira.data-export.v1",
      exportedAt: NOW.toISOString(),
      ...DATA,
    });
    expect(s.audited).toEqual([
      { action: "user.data_exported", actorId: HOLDER.id, requestId: "req-1" },
    ]);
  });

  it("allows three exports a day per account", async () => {
    const s = setup();
    for (let i = 0; i < 3; i += 1) await s.exportData.execute(HOLDER);
    await expect(s.exportData.execute(HOLDER)).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(s.audited).toHaveLength(3);
  });

  it("answers that the account is gone when there is none", async () => {
    const s = setup();
    await expect(
      s.exportData.execute({ ...HOLDER, id: "0192a0e4-0000-7000-8000-00000000ffff" }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(s.audited).toEqual([]);
  });
});

describe("account erasure", () => {
  it("erases in a transaction and audits it", async () => {
    const s = setup("erased");
    await s.erase.execute(HOLDER, { requestId: "req-2" });
    expect(s.calls).toEqual([`erase ${HOLDER.id} ${NOW.toISOString()}`]);
    expect(s.audited).toEqual([
      { action: "user.anonymized", actorId: HOLDER.id, requestId: "req-2" },
    ]);
  });

  it("refuses an organizer with events to come, and audits nothing", async () => {
    const s = setup("upcoming-events");
    await expect(s.erase.execute(HOLDER)).rejects.toBeInstanceOf(OrganizerHasUpcomingEventsError);
    expect(s.audited).toEqual([]);
  });

  it("answers that the account is gone when it was already erased", async () => {
    const s = setup("missing");
    await expect(s.erase.execute(HOLDER)).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(s.audited).toEqual([]);
  });
});

describe("retention", () => {
  it("applies the rules with the cutoffs counted from now", async () => {
    const s = setup();
    await s.retention.execute();
    expect(s.calls).toEqual(["retention 2026-07-24T12:00:00.000Z"]);
  });
});
