import { timingSafeEqual } from "node:crypto";

import type { CheckinMethod, CheckinResult } from "@vira/shared";

/** The event the door is open for, and whose it is. */
export interface Door {
  readonly eventId: string;
  readonly organizerId: string;
}

/** A ticket as the door reads it: enough to judge it and to show who is entering. */
export interface DoorTicket {
  readonly id: string;
  readonly eventId: string;
  /** The organizer of the ticket's own event. */
  readonly organizerId: string;
  readonly status: "VALID" | "USED" | "CANCELED";
  readonly qrNonce: Buffer;
  readonly code: string;
  readonly holderName: string;
  readonly ticketTypeName: string;
  readonly usedAt: Date | null;
}

/** What was read: a signed QR (with the nonce it carries) or a typed code. */
export type DoorRead =
  { readonly method: "QR"; readonly nonce: Buffer } | { readonly method: "CODE" };

/**
 * What the door does with a ticket: try to let it in (the guarded UPDATE decides), or
 * refuse it. `showTicket` says whether the operator may see who it is; `recordTicket`
 * whether the attempt names it.
 */
export type Verdict =
  | { readonly kind: "claim" }
  | {
      readonly kind: "refuse";
      readonly result: Exclude<CheckinResult, "VALID">;
      readonly showTicket: boolean;
      readonly recordTicket: boolean;
    };

const refuse = (
  result: Exclude<CheckinResult, "VALID">,
  { showTicket = false, recordTicket = false } = {},
): Verdict => ({ kind: "refuse", result, showTicket, recordTicket });

/**
 * Judges a read at the door (ADR-0008, docs/SECURITY_MODEL.md#34-check-in):
 *
 * - no such ticket, or a QR whose nonce is not the ticket's (it was reissued): `INVALID`;
 * - a ticket of another event: `WRONG_EVENT`, without saying whose. A typed code is only
 *   told apart when the other event is the same organizer's: anyone else's codes are
 *   `INVALID`, so the manual entry cannot be used to learn which codes exist;
 * - a canceled ticket: `INVALID`, showing which one it is;
 * - a ticket that already went in: `ALREADY_USED`, with who and when;
 * - a valid ticket of this event: claimed, if no other read claims it first.
 */
export function judge(ticket: DoorTicket | null, read: DoorRead, door: Door): Verdict {
  if (!ticket) return refuse("INVALID");
  if (read.method === "QR" && !sameNonce(read.nonce, ticket.qrNonce)) {
    return refuse("INVALID", { recordTicket: ticket.eventId === door.eventId });
  }
  if (ticket.eventId !== door.eventId) {
    return read.method === "QR" || ticket.organizerId === door.organizerId
      ? refuse("WRONG_EVENT", { recordTicket: true })
      : refuse("INVALID");
  }
  if (ticket.status === "CANCELED") {
    return refuse("INVALID", { showTicket: true, recordTicket: true });
  }
  if (ticket.status === "USED") {
    return refuse("ALREADY_USED", { showTicket: true, recordTicket: true });
  }
  return { kind: "claim" };
}

function sameNonce(read: Buffer, stored: Buffer): boolean {
  return read.length === stored.length && timingSafeEqual(read, stored);
}

/** The method as the audit catalog spells it. */
export function auditMethod(method: CheckinMethod): "qr" | "code" {
  return method === "QR" ? "qr" : "code";
}
