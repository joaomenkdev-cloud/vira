import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  IssuedOrder,
  NewTicket,
  TicketCursor,
  TicketPage,
  TicketRepository,
} from "../application/ports/ticket-repository.js";
import type { Ticket } from "../domain/ticket.js";

const withDetails = {
  event: {
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      venueName: true,
      venueCity: true,
      venueState: true,
    },
  },
  ticketType: { select: { name: true } },
} satisfies Prisma.TicketInclude;

type TicketRow = Prisma.TicketGetPayload<{ include: typeof withDetails }>;

function ticketOf(row: TicketRow): Ticket {
  return {
    id: row.id,
    orderId: row.orderId,
    code: row.code,
    status: row.status,
    holderName: row.holderName,
    ticketTypeName: row.ticketType.name,
    event: row.event,
    issuedAt: row.issuedAt,
    usedAt: row.usedAt,
    qrNonce: Buffer.from(row.qrNonce),
  };
}

@Injectable()
export class PrismaTicketRepository implements TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tickets: readonly NewTicket[], tx: TransactionContext): Promise<Set<string>> {
    const client = clientFor(this.prisma, tx);
    // A code that is taken is skipped (ON CONFLICT DO NOTHING) instead of failing the
    // payment's transaction; the caller draws another for it.
    await client.ticket.createMany({
      data: tickets.map((ticket) => ({ ...ticket, qrNonce: new Uint8Array(ticket.qrNonce) })),
      skipDuplicates: true,
    });
    const inserted = await client.ticket.findMany({
      where: { id: { in: tickets.map((ticket) => ticket.id) } },
      select: { id: true },
    });
    return new Set(inserted.map((row) => row.id));
  }

  async findOwned(ticketId: string, buyerId: string): Promise<Ticket | null> {
    const row = await this.prisma.ticket.findFirst({
      where: { id: ticketId, order: { buyerId } },
      include: withDetails,
    });
    return row ? ticketOf(row) : null;
  }

  async listOwned(
    buyerId: string,
    options: {
      readonly when: "upcoming" | "past";
      readonly now: Date;
      readonly limit: number;
      readonly after?: TicketCursor;
    },
  ): Promise<TicketPage> {
    const upcoming = options.when === "upcoming";
    const direction = upcoming ? "asc" : "desc";
    const beyond = upcoming ? "gt" : "lt";
    const { after } = options;
    const rows = await this.prisma.ticket.findMany({
      where: {
        order: { buyerId },
        event: { endsAt: upcoming ? { gt: options.now } : { lte: options.now } },
        ...(after
          ? {
              OR: [
                { event: { startsAt: { [beyond]: after.startsAt } } },
                { event: { startsAt: after.startsAt }, id: { [beyond]: after.id } },
              ],
            }
          : {}),
      },
      include: withDetails,
      orderBy: [{ event: { startsAt: direction } }, { id: direction }],
      take: options.limit + 1,
    });
    const page = rows.slice(0, options.limit).map(ticketOf);
    const last = page.at(-1);
    return {
      tickets: page,
      next:
        rows.length > options.limit && last
          ? { startsAt: last.event.startsAt, id: last.id }
          : undefined,
    };
  }

  async findIssuedOrder(orderId: string): Promise<IssuedOrder | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        buyerName: true,
        buyerEmail: true,
        publicCode: true,
        event: withDetails.event,
        tickets: {
          select: { code: true, holderName: true, ticketType: { select: { name: true } } },
          orderBy: [{ ticketType: { sortOrder: "asc" } }, { code: "asc" }],
        },
      },
    });
    if (!order || order.tickets.length === 0) return null;
    return {
      buyerName: order.buyerName,
      buyerEmail: order.buyerEmail,
      publicCode: order.publicCode,
      event: order.event,
      tickets: order.tickets.map((ticket) => ({
        code: ticket.code,
        holderName: ticket.holderName,
        ticketTypeName: ticket.ticketType.name,
      })),
    };
  }
}
