import { Inject, Injectable } from "@nestjs/common";
import type { CheckinMethod, CheckinResult, Role } from "@vira/shared";

import {
  type TransactionContext,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  RATE_LIMITER,
  type RateLimiter,
  RateLimitExceededError,
  type RateLimitRule,
} from "../../../platform/rate-limit/rate-limiter.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { QrTokens } from "../../tickets/application/public-api.js";
import { OrganizerProfiles } from "../../users/application/public-api.js";
import {
  auditMethod,
  type Door,
  type DoorRead,
  type DoorTicket,
  judge,
  type Verdict,
} from "../domain/checkin.js";
import { EventNotFoundError } from "./errors.js";
import { CHECKIN_REPOSITORY, type CheckinRepository } from "./ports/checkin-repository.js";
import { CHECKIN_RATE_LIMITS } from "./rate-limits.js";

/** The operator at the door, as the access token describes them. */
export interface Operator {
  readonly id: string;
  readonly role: Role;
}

export interface RequestContext {
  readonly requestId?: string;
}

/** What the door's screen shows after a read. */
export interface CheckinOutcome {
  readonly result: CheckinResult;
  readonly ticket?: {
    readonly code: string;
    readonly holderName: string;
    readonly ticketTypeName: string;
  };
  /** When the ticket went in, for `ALREADY_USED`. */
  readonly usedAt?: Date;
}

/** What a read names before the ticket is looked up. */
type Lookup =
  | { readonly method: "QR"; readonly ticketId: string; readonly nonce: Buffer }
  | { readonly method: "CODE"; readonly code: string };

/**
 * Lets a ticket in at the door (V8, ADR-0008): by the signed QR or by the code printed
 * under it. Only the organizer of the event may, within a budget per operator. Every read
 * is recorded, valid or not, and an entry is audited.
 */
@Injectable()
export class CheckIn {
  constructor(
    @Inject(CHECKIN_REPOSITORY) private readonly checkins: CheckinRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly profiles: OrganizerProfiles,
    private readonly qrTokens: QrTokens,
    private readonly audit: AuditLog,
  ) {}

  /**
   * A QR read by the camera. A token that is not ours is refused without a query.
   *
   * @throws RateLimitExceededError past the operator's budget of reads.
   * @throws EventNotFoundError when the event is not the caller's.
   */
  async scan(
    operator: Operator,
    request: { readonly eventId: string; readonly token: string },
    context: RequestContext = {},
  ): Promise<CheckinOutcome> {
    const door = await this.open(operator, request.eventId, CHECKIN_RATE_LIMITS.scan);
    const claims = this.qrTokens.verify(request.token);
    if (!claims) {
      await this.record(door, operator, "QR", "INVALID", null);
      return { result: "INVALID" };
    }
    return this.check(door, operator, { method: "QR", ...claims }, context);
  }

  /**
   * A code typed by the operator, already in the canonical `VIRA-XXXX-XXXX`.
   *
   * @throws RateLimitExceededError past the operator's budget of codes.
   * @throws EventNotFoundError when the event is not the caller's.
   */
  async byCode(
    operator: Operator,
    request: { readonly eventId: string; readonly code: string },
    context: RequestContext = {},
  ): Promise<CheckinOutcome> {
    const door = await this.open(operator, request.eventId, CHECKIN_RATE_LIMITS.code);
    return this.check(door, operator, { method: "CODE", code: request.code }, context);
  }

  /** Spends the budget first, so a flood costs no query, then checks whose event it is. */
  private async open(operator: Operator, eventId: string, rule: RateLimitRule): Promise<Door> {
    const budget = await this.limiter.hit(rule, operator.id);
    if (!budget.allowed) throw new RateLimitExceededError(budget);
    const organizerId = await this.profiles.profileIdOf(operator.id);
    const door = organizerId ? await this.checkins.findDoor(eventId, organizerId) : null;
    if (!door) throw new EventNotFoundError();
    return door;
  }

  private async check(
    door: Door,
    operator: Operator,
    lookup: Lookup,
    context: RequestContext,
  ): Promise<CheckinOutcome> {
    const read: DoorRead =
      lookup.method === "QR" ? { method: "QR", nonce: lookup.nonce } : { method: "CODE" };
    const at = this.clock.now();
    const by = lookup.method === "QR" ? { id: lookup.ticketId } : { code: lookup.code };
    const outcome = await this.transactions.run(async (tx) => {
      const ticket = await this.checkins.findTicket(by, tx);
      const verdict = judge(ticket, read, door);
      if (verdict.kind === "claim" && ticket) {
        const nonce = lookup.method === "QR" ? { qrNonce: lookup.nonce } : {};
        const target = { id: ticket.id, eventId: door.eventId, ...nonce };
        if (await this.checkins.claim(target, operator.id, at, tx)) {
          await this.record(door, operator, lookup.method, "VALID", ticket.id, at, tx);
          return {
            entered: ticket.id,
            outcome: { result: "VALID", ticket: shown(ticket) } as const,
          };
        }
        // Another read got there first: what it left behind is the answer.
        const after = await this.checkins.findTicket(by, tx);
        return this.refuse(judge(after, read, door), after, door, operator, lookup.method, at, tx);
      }
      return this.refuse(verdict, ticket, door, operator, lookup.method, at, tx);
    });
    if (outcome.entered) {
      await this.audit.record(
        {
          action: "ticket.checked_in",
          entityId: outcome.entered,
          metadata: { eventId: door.eventId, method: auditMethod(lookup.method) },
        },
        {
          actor: { id: operator.id, role: operator.role },
          ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
        },
      );
    }
    return outcome.outcome;
  }

  private async refuse(
    verdict: Verdict,
    ticket: DoorTicket | null,
    door: Door,
    operator: Operator,
    method: CheckinMethod,
    at: Date,
    tx: TransactionContext,
  ): Promise<{ entered: null; outcome: CheckinOutcome }> {
    // A ticket left VALID by a failed claim would mean the guarded UPDATE is broken.
    if (verdict.kind === "claim") throw new Error("A valid ticket could not be claimed");
    const recorded = verdict.recordTicket && ticket ? ticket.id : null;
    await this.record(door, operator, method, verdict.result, recorded, at, tx);
    return { entered: null, outcome: refusal(verdict.result, verdict.showTicket ? ticket : null) };
  }

  private record(
    door: Door,
    operator: Operator,
    method: CheckinMethod,
    result: CheckinResult,
    ticketId: string | null,
    at: Date = this.clock.now(),
    tx?: TransactionContext,
  ): Promise<void> {
    return this.checkins.recordAttempt(
      {
        id: this.ids.next(),
        eventId: door.eventId,
        ticketId,
        operatorId: operator.id,
        result,
        method,
        createdAt: at,
      },
      tx,
    );
  }
}

function shown(ticket: DoorTicket): NonNullable<CheckinOutcome["ticket"]> {
  return {
    code: ticket.code,
    holderName: ticket.holderName,
    ticketTypeName: ticket.ticketTypeName,
  };
}

function refusal(result: CheckinResult, ticket: DoorTicket | null): CheckinOutcome {
  if (!ticket) return { result };
  return {
    result,
    ticket: shown(ticket),
    ...(result === "ALREADY_USED" && ticket.usedAt ? { usedAt: ticket.usedAt } : {}),
  };
}
