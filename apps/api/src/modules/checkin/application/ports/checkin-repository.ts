import type { CheckinMethod, CheckinResult } from "@vira/shared";

import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { Door, DoorTicket } from "../../domain/checkin.js";

/** One read at the door, as `checkin_attempts` keeps it. */
export interface CheckinAttempt {
  readonly id: string;
  readonly eventId: string;
  readonly ticketId: string | null;
  readonly operatorId: string;
  readonly result: CheckinResult;
  readonly method: CheckinMethod;
  readonly createdAt: Date;
}

/** A recent read, as the door's screen lists it. */
export interface RecentScan {
  readonly result: CheckinResult;
  readonly method: CheckinMethod;
  readonly at: Date;
  /** Only for a ticket of this event. */
  readonly ticket: {
    readonly code: string;
    readonly holderName: string;
    readonly ticketTypeName: string;
  } | null;
}

export interface CheckinStats {
  readonly checkedIn: number;
  readonly total: number;
  readonly lastScans: readonly RecentScan[];
}

export interface CheckinRepository {
  /** The event, if it is this organizer's: someone else's is not found, like a missing one. */
  findDoor(eventId: string, organizerId: string): Promise<Door | null>;

  /** A ticket of any event, by id (from a QR) or by code (typed). */
  findTicket(
    by: { readonly id: string } | { readonly code: string },
    tx: TransactionContext,
  ): Promise<DoorTicket | null>;

  /**
   * Marks the ticket USED only if it is still VALID, of this event and, for a QR, with
   * this nonce, all in one UPDATE: of two reads at once, exactly one gets `true`.
   */
  claim(
    ticket: { readonly id: string; readonly eventId: string; readonly qrNonce?: Buffer },
    operatorId: string,
    at: Date,
    tx: TransactionContext,
  ): Promise<boolean>;

  recordAttempt(attempt: CheckinAttempt, tx?: TransactionContext): Promise<void>;

  /** How many went in out of how many may, and the latest `scans` reads. */
  stats(eventId: string, scans: number): Promise<CheckinStats>;
}

export const CHECKIN_REPOSITORY = Symbol("CHECKIN_REPOSITORY");
