import { Injectable } from "@nestjs/common";

import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { ProcessedEvents } from "../application/ports/processed-events.js";

@Injectable()
export class PrismaProcessedEvents implements ProcessedEvents {
  constructor(private readonly prisma: PrismaService) {}

  async record(eventId: string, type: string, now: Date, tx: TransactionContext): Promise<boolean> {
    // A concurrent delivery of the same event waits here until the first one commits, then
    // conflicts; ON CONFLICT keeps the transaction usable either way.
    const inserted = await clientFor(this.prisma, tx).$executeRaw`
      INSERT INTO "processed_webhook_events" ("id", "type", "processed_at")
      VALUES (${eventId}, ${type}, ${now})
      ON CONFLICT ("id") DO NOTHING`;
    return inserted === 1;
  }
}
