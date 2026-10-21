import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  HeldTickets,
  NewOrder,
  OrderRepository,
} from "../application/ports/order-repository.js";
import type { Order } from "../domain/order.js";

const withDetails = {
  event: {
    select: { id: true, slug: true, title: true, startsAt: true, endsAt: true, timezone: true },
  },
  items: {
    include: { ticketType: { select: { name: true, sortOrder: true } } },
  },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof withDetails }>;

function orderOf(row: OrderRow): Order {
  const items = [...row.items].sort(
    (a, b) =>
      a.ticketType.sortOrder - b.ticketType.sortOrder || (a.ticketTypeId < b.ticketTypeId ? -1 : 1),
  );
  return {
    id: row.id,
    publicCode: row.publicCode,
    buyerId: row.buyerId,
    status: row.status,
    event: row.event,
    items: items.map((item) => ({
      id: item.id,
      ticketTypeId: item.ticketTypeId,
      name: item.ticketType.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    totalCents: row.totalCents,
    expiresAt: row.expiresAt,
    extensionCount: row.extensionCount,
    createdAt: row.createdAt,
    paidAt: row.paidAt,
  };
}

/**
 * Orders in PostgreSQL. The buyer is part of every lookup's `WHERE`; the single pending
 * order per buyer and event and the timestamps of each status are also enforced by the
 * migration.
 */
@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockIdempotencyKey(buyerId: string, key: string, tx: TransactionContext): Promise<boolean> {
    // A transaction-level advisory lock: released on commit or rollback, never left behind.
    // Two different keys may hash alike; the worst that does is a spurious `409`.
    const rows = await clientFor(this.prisma, tx).$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtextextended(${`order:${buyerId}:${key}`}, 0)) AS "locked"`;
    return rows[0]?.locked === true;
  }

  async findByIdempotencyKey(
    buyerId: string,
    key: string,
    tx: TransactionContext,
  ): Promise<{ id: string; requestHash: Uint8Array } | null> {
    return clientFor(this.prisma, tx).order.findUnique({
      where: { buyerId_idempotencyKey: { buyerId, idempotencyKey: key } },
      select: { id: true, requestHash: true },
    });
  }

  async findPending(
    buyerId: string,
    eventId: string,
    tx: TransactionContext,
  ): Promise<{ id: string; expiresAt: Date } | null> {
    return clientFor(this.prisma, tx).order.findFirst({
      where: { buyerId, eventId, status: "PENDING" },
      select: { id: true, expiresAt: true },
    });
  }

  async insert(
    order: NewOrder,
    tx: TransactionContext,
  ): Promise<"created" | "pending-exists" | "code-taken"> {
    const client = clientFor(this.prisma, tx);
    // ON CONFLICT DO NOTHING covers every unique index, the partial one of the single
    // pending order included: a conflict skips the row instead of aborting the
    // transaction. A concurrent insert waits here until the other transaction ends.
    const inserted = await client.$queryRaw<{ id: string }[]>`
      INSERT INTO "orders" (
        "id", "public_code", "buyer_id", "event_id", "total_cents", "expires_at",
        "idempotency_key", "request_hash", "buyer_name", "buyer_email", "created_at", "updated_at"
      ) VALUES (
        ${order.id}::uuid, ${order.publicCode}, ${order.buyerId}::uuid, ${order.eventId}::uuid,
        ${order.totalCents}, ${order.expiresAt}, ${order.idempotencyKey},
        ${Buffer.from(order.requestHash)}, ${order.buyerName}, ${order.buyerEmail}::citext,
        ${order.createdAt}, ${order.createdAt}
      )
      ON CONFLICT DO NOTHING
      RETURNING "id"`;
    if (inserted.length === 0) {
      const pending = await client.order.count({
        where: { buyerId: order.buyerId, eventId: order.eventId, status: "PENDING" },
      });
      return pending > 0 ? "pending-exists" : "code-taken";
    }
    await client.orderItem.createMany({
      data: order.items.map((item) => ({ ...item, orderId: order.id })),
    });
    return "created";
  }

  async markExpired(
    orderId: string,
    now: Date,
    tx: TransactionContext,
  ): Promise<HeldTickets[] | null> {
    const client = clientFor(this.prisma, tx);
    const { count } = await client.order.updateMany({
      where: { id: orderId, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", expiredAt: now },
    });
    if (count === 0) return null;
    return client.orderItem.findMany({
      where: { orderId },
      select: { ticketTypeId: true, quantity: true },
    });
  }

  async findOwned(
    orderId: string,
    buyerId: string,
    tx?: TransactionContext,
  ): Promise<Order | null> {
    const row = await clientFor(this.prisma, tx).order.findFirst({
      where: { id: orderId, buyerId },
      include: withDetails,
    });
    return row && orderOf(row);
  }
}
