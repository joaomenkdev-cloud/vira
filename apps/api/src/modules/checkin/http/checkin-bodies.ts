import type { CheckinResponseBody, CheckinStatsBody, CheckinTicketBody } from "@vira/shared";

import type { CheckinOutcome } from "../application/check-in.js";
import type { CheckinStats } from "../application/ports/checkin-repository.js";

function ticketBody(ticket: NonNullable<CheckinOutcome["ticket"]>): CheckinTicketBody {
  return { code: ticket.code, holderName: ticket.holderName, ticketType: ticket.ticketTypeName };
}

export function checkinBody(outcome: CheckinOutcome): CheckinResponseBody {
  return {
    result: outcome.result,
    ...(outcome.ticket ? { ticket: ticketBody(outcome.ticket) } : {}),
    ...(outcome.usedAt ? { usedAt: outcome.usedAt.toISOString() } : {}),
  };
}

export function checkinStatsBody(stats: CheckinStats): CheckinStatsBody {
  return {
    checkedIn: stats.checkedIn,
    total: stats.total,
    lastScans: stats.lastScans.map((scan) => ({
      result: scan.result,
      method: scan.method,
      at: scan.at.toISOString(),
      ...(scan.ticket ? { ticket: ticketBody(scan.ticket) } : {}),
    })),
  };
}
