import type { CheckinResponseBody, CheckinStatsBody } from "@vira/shared";

import { api } from "./browser";

/*
 * The door of an event (docs/API.md, "Check-in"). A read always answers 200 with a
 * `result`; an event of someone else answers 404, exactly as one that does not exist.
 */

export function scanTicket(eventId: string, token: string): Promise<CheckinResponseBody> {
  return api.request("/checkin/scan", { method: "POST", body: { eventId, token }, csrf: true });
}

/** `code` as typed: the API normalizes it (case, prefix, dashes, O for 0). */
export function checkTicketCode(eventId: string, code: string): Promise<CheckinResponseBody> {
  return api.request("/checkin/code", { method: "POST", body: { eventId, code }, csrf: true });
}

export function getCheckinStats(eventId: string): Promise<CheckinStatsBody> {
  return api.request(`/organizer/events/${encodeURIComponent(eventId)}/checkin/stats`);
}
