import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  CheckinAttempt,
  CheckinRepository,
  CheckinStats,
} from "../application/ports/checkin-repository.js";
import type { Door, DoorTicket } from "../domain/checkin.js";

const doorTicket = {
  id: true,
  eventId: true,
  status: true,
  qrNonce: true,
  code: true,
  holderName: true,
  usedAt: true,
  event: { select: { organizerId: true } },
  ticketType: { select: { name: true } },
} satisfies Prisma.TicketSelect;

@Injectable()
export class PrismaCheckinRepository implements CheckinRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findDoor(eventId: string, organizerId: string): Promise<Door | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizerId },
      select: { id: true, organizerId: true },
    });
    return event ? { eventId: event.id, organizerId: event.organizerId } : null;
  }

  async findTicket(
    by: { readonly id: string } | { readonly code: string },
    tx: TransactionContext,
  ): Promise<DoorTicket | null> {
    const row = await clientFor(this.prisma, tx).ticket.findUnique({
      where: "id" in by ? { id: by.id } : { code: by.code },
      select: doorTicket,
    });
    if (!row) return null;
    return {
      id: row.id,
      eventId: row.eventId,
      organizerId: row.event.organizerId,
      status: row.status,
      qrNonce: Buffer.from(row.qrNonce),
      code: row.code,
      holderName: row.holderName,
      ticketTypeName: row.ticketType.name,
      usedAt: row.usedAt,
    };
  }

  async claim(
    ticket: { readonly id: string; readonly eventId: string; readonly qrNonce?: Buffer },
    operatorId: string,
    at: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    const client = clientFor(this.prisma, tx);
    // ADR-0008: the WHERE is the whole rule. Of two reads at once, the second waits for
    // the first's row lock, finds the ticket USED and changes nothing.
    const claimed = ticket.qrNonce
      ? await client.$executeRaw`
          UPDATE "tickets"
             SET "status" = 'USED', "used_at" = ${at}, "checked_in_by" = ${operatorId}::uuid
           WHERE "id" = ${ticket.id}::uuid AND "event_id" = ${ticket.eventId}::uuid
             AND "status" = 'VALID' AND "qr_nonce" = ${new Uint8Array(ticket.qrNonce)}`
      : await client.$executeRaw`
          UPDATE "tickets"
             SET "status" = 'USED', "used_at" = ${at}, "checked_in_by" = ${operatorId}::uuid
           WHERE "id" = ${ticket.id}::uuid AND "event_id" = ${ticket.eventId}::uuid
             AND "status" = 'VALID'`;
    return claimed === 1;
  }

  async recordAttempt(attempt: CheckinAttempt, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).checkinAttempt.create({ data: { ...attempt } });
  }

  async stats(eventId: string, scans: number): Promise<CheckinStats> {
    const [counts, attempts] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ["status"],
        where: { eventId, status: { in: ["VALID", "USED"] } },
        _count: { _all: true },
      }),
      this.prisma.checkinAttempt.findMany({
        where: { eventId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: scans,
        select: {
          result: true,
          method: true,
          createdAt: true,
          ticket: {
            select: {
              eventId: true,
              code: true,
              holderName: true,
              ticketType: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    const count = (status: "VALID" | "USED") =>
      counts.find((row) => row.status === status)?._count._all ?? 0;
    return {
      checkedIn: count("USED"),
      total: count("VALID") + count("USED"),
      lastScans: attempts.map((attempt) => ({
        result: attempt.result,
        method: attempt.method,
        at: attempt.createdAt,
        // A ticket of another event (WRONG_EVENT) is not this door's to show.
        ticket:
          attempt.ticket?.eventId === eventId
            ? {
                code: attempt.ticket.code,
                holderName: attempt.ticket.holderName,
                ticketTypeName: attempt.ticket.ticketType.name,
              }
            : null,
      })),
    };
  }
}
