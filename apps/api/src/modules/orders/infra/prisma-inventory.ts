import { Injectable } from "@nestjs/common";

import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { Inventory, Reservation } from "../application/ports/inventory.js";
import type { SaleEvent } from "../domain/reservation-policy.js";

/**
 * The stock lives in `ticket_types` (docs/DATA_MODEL.md#ticket_types), read here the way
 * the catalog reads it: orders only touch `reserved` (and, from V4, `sold`).
 */
@Injectable()
export class PrismaInventory implements Inventory {
  constructor(private readonly prisma: PrismaService) {}

  async findEventForSale(eventId: string, tx: TransactionContext): Promise<SaleEvent | null> {
    const client = clientFor(this.prisma, tx);
    // KEY SHARE: concurrent orders do not wait on each other, but cancelling the event
    // or editing its ticket types (which lock the row FOR UPDATE) waits for this order.
    const locked = await client.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "events"
       WHERE "id" = ${eventId}::uuid AND "status" IN ('PUBLISHED', 'CANCELED')
         FOR KEY SHARE`;
    if (locked.length === 0) return null;
    const row = await client.event.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        endsAt: true,
        ticketTypes: {
          select: {
            id: true,
            name: true,
            priceCents: true,
            maxPerOrder: true,
            salesStartAt: true,
            salesEndAt: true,
          },
        },
      },
    });
    return { ...row, status: row.status === "CANCELED" ? "CANCELED" : "PUBLISHED" };
  }

  async reserve(
    ticketTypeId: string,
    quantity: number,
    tx: TransactionContext,
  ): Promise<Reservation> {
    const client = clientFor(this.prisma, tx);
    // The conditional UPDATE of ADR-0007: the row lock serializes concurrent orders, and
    // each one sees the stock the previous one left. The price comes from the same row.
    const held = await client.$queryRaw<{ price_cents: number }[]>`
      UPDATE "ticket_types"
         SET "reserved" = "reserved" + ${quantity}, "updated_at" = now()
       WHERE "id" = ${ticketTypeId}::uuid AND "sold" + "reserved" + ${quantity} <= "capacity"
      RETURNING "price_cents"`;
    const row = held[0];
    if (row) return { reserved: true, unitPriceCents: row.price_cents };
    const stock = await client.ticketType.findUniqueOrThrow({
      where: { id: ticketTypeId },
      select: { capacity: true, sold: true, reserved: true },
    });
    return {
      reserved: false,
      available: Math.max(0, stock.capacity - stock.sold - stock.reserved),
    };
  }

  async sell(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).$executeRaw`
      UPDATE "ticket_types"
         SET "reserved" = "reserved" - ${quantity}, "sold" = "sold" + ${quantity}, "updated_at" = now()
       WHERE "id" = ${ticketTypeId}::uuid`;
  }

  async sellUnheld(
    ticketTypeId: string,
    quantity: number,
    tx: TransactionContext,
  ): Promise<boolean> {
    // The same conditional UPDATE as a reservation: never more than the capacity.
    const sold = await clientFor(this.prisma, tx).$executeRaw`
      UPDATE "ticket_types"
         SET "sold" = "sold" + ${quantity}, "updated_at" = now()
       WHERE "id" = ${ticketTypeId}::uuid AND "sold" + "reserved" + ${quantity} <= "capacity"`;
    return sold === 1;
  }

  async unsell(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).$executeRaw`
      UPDATE "ticket_types"
         SET "sold" = "sold" - ${quantity}, "updated_at" = now()
       WHERE "id" = ${ticketTypeId}::uuid`;
  }

  async release(ticketTypeId: string, quantity: number, tx: TransactionContext): Promise<void> {
    // The CHECK on `reserved >= 0` refuses giving back more than was held.
    await clientFor(this.prisma, tx).$executeRaw`
      UPDATE "ticket_types"
         SET "reserved" = "reserved" - ${quantity}, "updated_at" = now()
       WHERE "id" = ${ticketTypeId}::uuid`;
  }
}
