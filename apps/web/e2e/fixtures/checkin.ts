// The door of the organizers' events in the stand-in API (POST /api/v1/checkin/scan and
// /code, GET /organizer/events/{id}/checkin/stats), in memory. The answers follow
// docs/API.md ("Check-in"): a business `result` with 200, 404 for someone else's event.
// The tickets are made by the test route below, with tokens the tests choose, so a QR
// shown to the fake camera can name one of them.
import { randomUUID } from "node:crypto";
import {
  checkinCodeRequestSchema,
  checkinScanRequestSchema,
  type CheckinResponseBody,
  type CheckinScanBody,
  type CheckinTicketBody,
} from "@vira/shared";

import { organizerEventOwner, seedPublishedEvent } from "./organizer.ts";

type Body = Record<string, unknown>;

export interface CheckinContext {
  /** The signed-in organizer (valid session, CSRF checked on writes), or undefined once answered. */
  organizer: (options: { csrf: boolean }) => { id: string; displayName: string } | undefined;
  send: (status: number, body?: unknown) => void;
  problem: (status: number, code: string, extra?: Body) => void;
}

interface DoorTicket {
  eventId: string;
  code: string;
  token: string;
  holderName: string;
  status: "VALID" | "USED" | "CANCELED";
  usedAt: string | null;
}

const tickets: DoorTicket[] = [];
const scans = new Map<string, CheckinScanBody[]>();

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const code = () => {
  const part = () =>
    Array.from({ length: 4 }, () => CROCKFORD[Math.floor(Math.random() * 32)]).join("");
  return `VIRA-${part()}-${part()}`;
};

const shown = (ticket: DoorTicket): CheckinTicketBody => ({
  code: ticket.code,
  holderName: ticket.holderName,
  ticketType: "Pista",
});

/** The same rules as the API's `judge` (apps/api/src/modules/checkin/domain/checkin.ts). */
function check(
  ticket: DoorTicket | undefined,
  eventId: string,
  ownerId: string,
  method: "QR" | "CODE",
): CheckinResponseBody {
  if (!ticket) return { result: "INVALID" };
  if (ticket.eventId !== eventId) {
    return method === "QR" || organizerEventOwner(ticket.eventId) === ownerId
      ? { result: "WRONG_EVENT" }
      : { result: "INVALID" };
  }
  if (ticket.status === "CANCELED") return { result: "INVALID", ticket: shown(ticket) };
  if (ticket.status === "USED") {
    return { result: "ALREADY_USED", ticket: shown(ticket), usedAt: ticket.usedAt ?? "" };
  }
  ticket.status = "USED";
  ticket.usedAt = new Date().toISOString();
  return { result: "VALID", ticket: shown(ticket) };
}

/** Answers the check-in routes; returns false for any other path. */
export function handleCheckin(
  method: string,
  path: string,
  body: Body,
  context: CheckinContext,
): boolean {
  const statsRoute = /^\/organizer\/events\/([^/]+)\/checkin\/stats$/.exec(path);
  const read =
    method === "POST" && (path === "/checkin/scan" || path === "/checkin/code")
      ? path.slice("/checkin/".length)
      : undefined;
  if (!(statsRoute && method === "GET") && !read) return false;

  const organizer = context.organizer({ csrf: method !== "GET" });
  if (!organizer) return true;

  if (statsRoute) {
    const eventId = statsRoute[1] ?? "";
    if (organizerEventOwner(eventId) !== organizer.id) {
      context.problem(404, "not-found");
      return true;
    }
    const own = tickets.filter((t) => t.eventId === eventId && t.status !== "CANCELED");
    context.send(200, {
      checkedIn: own.filter((t) => t.status === "USED").length,
      total: own.length,
      lastScans: (scans.get(eventId) ?? []).slice(0, 5),
    });
    return true;
  }

  const parsed =
    read === "scan"
      ? checkinScanRequestSchema.safeParse(body)
      : checkinCodeRequestSchema.safeParse(body);
  if (!parsed.success) {
    context.problem(400, "validation-failed", {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
    return true;
  }
  const request = parsed.data;
  if (organizerEventOwner(request.eventId) !== organizer.id) {
    context.problem(404, "not-found");
    return true;
  }
  // The fake camera shows one token to every test: each gives it to a ticket of its own
  // event, so a read at that door finds that ticket first.
  const ticket =
    "token" in request
      ? (tickets.find((t) => t.token === request.token && t.eventId === request.eventId) ??
        tickets.find((t) => t.token === request.token))
      : tickets.find((t) => t.code === request.code);
  const readBy = "token" in request ? "QR" : "CODE";
  const outcome = check(ticket, request.eventId, organizer.id, readBy);
  scans.set(request.eventId, [
    {
      result: outcome.result,
      method: readBy,
      at: new Date().toISOString(),
      ...(ticket?.eventId === request.eventId ? { ticket: shown(ticket) } : {}),
    },
    ...(scans.get(request.eventId) ?? []),
  ]);
  context.send(200, outcome);
  return true;
}

/**
 * Test-only route (never proxied):
 *   POST /__test/checkin/event?email=&title=&holders=Ana,Caio&statuses=VALID,USED&token=
 *        a published event of that organizer, on tonight, with one ticket per holder; the
 *        first ticket's QR carries `token` when given (the fake camera shows it)
 */
export function handleCheckinTestRoute(
  method: string,
  url: URL,
  send: (status: number, body?: unknown) => void,
  organizerByEmail: (email: string) => { id: string; displayName: string } | undefined,
): boolean {
  if (method !== "POST" || url.pathname !== "/__test/checkin/event") return false;
  const owner = organizerByEmail(url.searchParams.get("email") ?? "");
  if (!owner) {
    send(404, { error: "no organizer" });
    return true;
  }
  const event = seedPublishedEvent(owner, url.searchParams.get("title") ?? "Noite de forró");
  const holders = (url.searchParams.get("holders") ?? "Ana Souza").split(",");
  const statuses = (url.searchParams.get("statuses") ?? "").split(",");
  const token = url.searchParams.get("token");
  const made = holders.map((holderName, index) => {
    const status = statuses[index];
    const ticket: DoorTicket = {
      eventId: event.id,
      code: code(),
      token: index === 0 && token ? token : `v1.fake.${randomUUID()}`,
      holderName,
      status: status === "USED" || status === "CANCELED" ? status : "VALID",
      usedAt: status === "USED" ? new Date().toISOString() : null,
    };
    tickets.push(ticket);
    return { code: ticket.code, token: ticket.token };
  });
  send(200, { eventId: event.id, tickets: made });
  return true;
}
