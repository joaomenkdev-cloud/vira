import { describe, expect, it } from "vitest";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { RateLimiter, RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";
import { RateLimitExceededError } from "../../../platform/rate-limit/rate-limiter.js";
import { type AuditLog } from "../../audit/application/public-api.js";
import { QrTokens } from "../../tickets/application/public-api.js";
import { type OrganizerProfiles } from "../../users/application/public-api.js";
import type { Door, DoorTicket } from "../domain/checkin.js";
import { CheckIn } from "./check-in.js";
import { EventNotFoundError } from "./errors.js";
import { GetCheckinStats } from "./get-checkin-stats.js";
import type {
  CheckinAttempt,
  CheckinRepository,
  CheckinStats,
} from "./ports/checkin-repository.js";

const EVENT = "0192a0e4-0000-7000-8000-0000000e0001";
const OTHER_EVENT = "0192a0e4-0000-7000-8000-0000000e0002";
const TICKET = "0192a0e4-3333-7000-8000-000000000001";
const NOW = new Date("2026-12-05T23:00:00Z");
const KEYS = [{ kid: "t1", key: Buffer.alloc(32, 5) }];
const OPERATOR = { id: "operator", role: "ORGANIZER" } as const;

/** Tickets and attempts in memory; the claim is the same guarded update as the SQL. */
class InMemoryCheckins implements CheckinRepository {
  readonly attempts: CheckinAttempt[] = [];
  readonly tickets = new Map<string, DoorTicket>();
  readonly events = new Map<string, string>([
    [EVENT, "org-1"],
    [OTHER_EVENT, "org-2"],
  ]);
  /** Runs once, between the lookup and the claim: another read at the same moment. */
  beforeClaim: (() => void) | undefined;

  findDoor(eventId: string, organizerId: string): Promise<Door | null> {
    return Promise.resolve(
      this.events.get(eventId) === organizerId ? { eventId, organizerId } : null,
    );
  }

  findTicket(by: { id: string } | { code: string }): Promise<DoorTicket | null> {
    const found = [...this.tickets.values()].find((t) =>
      "id" in by ? t.id === by.id : t.code === by.code,
    );
    return Promise.resolve(found ?? null);
  }

  claim(
    target: { id: string; eventId: string; qrNonce?: Buffer },
    _operatorId: string,
    at: Date,
  ): Promise<boolean> {
    this.beforeClaim?.();
    this.beforeClaim = undefined;
    const ticket = this.tickets.get(target.id);
    if (
      ticket?.status !== "VALID" ||
      ticket.eventId !== target.eventId ||
      target.qrNonce?.equals(ticket.qrNonce) === false
    ) {
      return Promise.resolve(false);
    }
    this.tickets.set(target.id, { ...ticket, status: "USED", usedAt: at });
    return Promise.resolve(true);
  }

  recordAttempt(attempt: CheckinAttempt): Promise<void> {
    this.attempts.push(attempt);
    return Promise.resolve();
  }

  stats(): Promise<CheckinStats> {
    return Promise.resolve({ checkedIn: 0, total: 0, lastScans: [] });
  }
}

class CountingLimiter implements RateLimiter {
  readonly hits: string[] = [];
  constructor(private readonly limit = Infinity) {}

  hit(rule: RateLimitRule, subject: string) {
    this.hits.push(`${rule.name}:${subject}`);
    const used = this.hits.filter((hit) => hit === `${rule.name}:${subject}`).length;
    return Promise.resolve({
      allowed: used <= Math.min(this.limit, rule.limit),
      limit: rule.limit,
      remaining: 0,
      resetSeconds: 60,
    });
  }
}

interface Setup {
  readonly limit?: number;
  /** The organizer profile of each user; the operator runs the event's organizer. */
  readonly organizerOf?: Readonly<Record<string, string>>;
}

function setup({ limit = Infinity, organizerOf = { operator: "org-1" } }: Setup = {}) {
  const checkins = new InMemoryCheckins();
  const audited: unknown[] = [];
  const limiter = new CountingLimiter(limit);
  let sequence = 0;
  const qrTokens = new QrTokens({ tickets: { qrSigningKeys: KEYS } } as never);
  const checkIn = new CheckIn(
    checkins,
    { run: (work) => work({} as TransactionContext) },
    limiter,
    { now: () => NOW },
    { next: () => `attempt-${String(++sequence)}` },
    { profileIdOf: (id: string) => Promise.resolve(organizerOf[id] ?? null) } as OrganizerProfiles,
    qrTokens,
    {
      record: (event: unknown) => {
        audited.push(event);
        return Promise.resolve();
      },
    } as unknown as AuditLog,
  );
  const issue = (overrides: Partial<DoorTicket> = {}) => {
    const ticket: DoorTicket = {
      id: TICKET,
      eventId: EVENT,
      organizerId: "org-1",
      status: "VALID",
      qrNonce: Buffer.alloc(16, 1),
      code: "VIRA-7KQ2-M9XD",
      holderName: "Ana Souza",
      ticketTypeName: "Pista",
      usedAt: null,
      ...overrides,
    };
    checkins.tickets.set(ticket.id, ticket);
    return { ticket, token: qrTokens.tokenFor(ticket) };
  };
  return { checkIn, checkins, audited, limiter, issue };
}

describe("check-in", () => {
  it("lets a ticket in once, records the read and audits the entry", async () => {
    const { checkIn, checkins, audited, issue } = setup();
    const { token } = issue();

    expect(await checkIn.scan(OPERATOR, { eventId: EVENT, token }, { requestId: "r1" })).toEqual({
      result: "VALID",
      ticket: { code: "VIRA-7KQ2-M9XD", holderName: "Ana Souza", ticketTypeName: "Pista" },
    });
    expect(checkins.tickets.get(TICKET)).toMatchObject({ status: "USED", usedAt: NOW });
    expect(checkins.attempts).toEqual([
      {
        id: "attempt-1",
        eventId: EVENT,
        ticketId: TICKET,
        operatorId: "operator",
        result: "VALID",
        method: "QR",
        createdAt: NOW,
      },
    ]);
    expect(audited).toEqual([
      {
        action: "ticket.checked_in",
        entityId: TICKET,
        metadata: { eventId: EVENT, method: "qr" },
      },
    ]);

    // The same QR again, a moment later: already used, with when.
    expect(await checkIn.scan(OPERATOR, { eventId: EVENT, token })).toEqual({
      result: "ALREADY_USED",
      ticket: { code: "VIRA-7KQ2-M9XD", holderName: "Ana Souza", ticketTypeName: "Pista" },
      usedAt: NOW,
    });
    expect(checkins.attempts.map((a) => a.result)).toEqual(["VALID", "ALREADY_USED"]);
    expect(audited).toHaveLength(1);
  });

  it("answers the read that lost a race with what the winner left", async () => {
    const { checkIn, checkins, audited, issue } = setup();
    const { token } = issue();
    // Between this read's lookup and its claim, another door lets the ticket in.
    checkins.beforeClaim = () => {
      const ticket = checkins.tickets.get(TICKET);
      if (ticket) checkins.tickets.set(TICKET, { ...ticket, status: "USED", usedAt: NOW });
    };

    const outcome = await checkIn.scan(OPERATOR, { eventId: EVENT, token });
    expect(outcome.result).toBe("ALREADY_USED");
    expect(checkins.attempts.map((a) => a.result)).toEqual(["ALREADY_USED"]);
    expect(audited).toHaveLength(0);
  });

  it("refuses a forged or altered token without looking it up", async () => {
    const { checkIn, checkins, issue } = setup();
    const { token } = issue();
    const last = token.at(-1) === "A" ? "B" : "A";

    for (const forged of [`${token.slice(0, -1)}${last}`, "https://example.com", "v1.t1.x.y"]) {
      expect(await checkIn.scan(OPERATOR, { eventId: EVENT, token: forged })).toEqual({
        result: "INVALID",
      });
    }
    expect(checkins.tickets.get(TICKET)?.status).toBe("VALID");
    expect(checkins.attempts.every((a) => a.result === "INVALID" && a.ticketId === null)).toBe(
      true,
    );
  });

  it("refuses a ticket of another event", async () => {
    const { checkIn, issue } = setup();
    const { token } = issue({ eventId: OTHER_EVENT, organizerId: "org-2" });
    expect(await checkIn.scan(OPERATOR, { eventId: EVENT, token })).toEqual({
      result: "WRONG_EVENT",
    });
  });

  it("refuses a canceled ticket, saying which", async () => {
    const { checkIn, issue } = setup();
    issue({ status: "CANCELED" });
    expect(await checkIn.byCode(OPERATOR, { eventId: EVENT, code: "VIRA-7KQ2-M9XD" })).toEqual({
      result: "INVALID",
      ticket: { code: "VIRA-7KQ2-M9XD", holderName: "Ana Souza", ticketTypeName: "Pista" },
    });
  });

  it("lets a ticket in by its code, and audits it as such", async () => {
    const { checkIn, checkins, audited, issue } = setup();
    issue();
    const outcome = await checkIn.byCode(OPERATOR, { eventId: EVENT, code: "VIRA-7KQ2-M9XD" });
    expect(outcome.result).toBe("VALID");
    expect(checkins.attempts[0]?.method).toBe("CODE");
    expect(audited).toMatchObject([{ metadata: { method: "code" } }]);
    expect(
      (await checkIn.byCode(OPERATOR, { eventId: EVENT, code: "VIRA-0000-0000" })).result,
    ).toBe("INVALID");
  });

  it("opens the door only to the event's organizer", async () => {
    const { checkIn, checkins, issue } = setup({
      organizerOf: { operator: "org-1", intruder: "org-2" },
    });
    const { token } = issue();
    const intruder = { id: "intruder", role: "ORGANIZER" } as const;
    const buyer = { id: "buyer", role: "BUYER" } as const;

    await expect(checkIn.scan(intruder, { eventId: EVENT, token })).rejects.toThrow(
      EventNotFoundError,
    );
    await expect(checkIn.scan(buyer, { eventId: EVENT, token })).rejects.toThrow(
      EventNotFoundError,
    );
    await expect(checkIn.scan(OPERATOR, { eventId: OTHER_EVENT, token })).rejects.toThrow(
      EventNotFoundError,
    );
    expect(checkins.tickets.get(TICKET)?.status).toBe("VALID");
    expect(checkins.attempts).toHaveLength(0);

    const stats = new GetCheckinStats(checkins, {
      profileIdOf: (id: string) => Promise.resolve(id === "operator" ? "org-1" : null),
    } as OrganizerProfiles);
    await expect(stats.execute(intruder, EVENT)).rejects.toThrow(EventNotFoundError);
    await expect(stats.execute(OPERATOR, EVENT)).resolves.toMatchObject({ checkedIn: 0 });
  });

  it("spends the operator's budget before anything else", async () => {
    const { checkIn, checkins, limiter, issue } = setup({ limit: 2 });
    issue();
    const read = () => checkIn.byCode(OPERATOR, { eventId: EVENT, code: "VIRA-0000-0000" });
    await read();
    await read();
    await expect(read()).rejects.toThrow(RateLimitExceededError);
    expect(checkins.attempts).toHaveLength(2);
    expect(limiter.hits).toEqual(Array(3).fill("checkin.code.operator:operator"));
  });
});
