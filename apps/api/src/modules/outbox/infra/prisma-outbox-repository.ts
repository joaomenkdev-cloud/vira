import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { DispatchOutcome, OutboxRepository } from "../application/ports/outbox-repository.js";
import { OUTBOX_TYPES, type OutboxType } from "../domain/outbox-catalog.js";
import { recordAttempt } from "../domain/delivery.js";
import type { OutboxMessage } from "../domain/outbox-message.js";
import { MAX_DISPATCH_ATTEMPTS } from "../domain/retry-policy.js";

interface DueRow {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: Date;
  attempts: number;
}

function isOutboxType(type: string): type is OutboxType {
  return (OUTBOX_TYPES as string[]).includes(type);
}

@Injectable()
export class PrismaOutboxRepository implements OutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(message: OutboxMessage, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).outboxMessage.create({
      data: {
        id: message.id,
        type: message.type,
        // Shape already validated against the outbox catalog, which only allows JSON values.
        payload: { ...message.payload } as Prisma.InputJsonObject,
        createdAt: message.createdAt,
        availableAt: message.createdAt,
      },
    });
  }

  async processDue(
    limit: number,
    now: Date,
    process: (batch: readonly OutboxMessage[]) => Promise<readonly DispatchOutcome[]>,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (client) => {
        // Rows locked by another dispatcher are skipped, so two dispatchers never
        // hand out the same message; the locks last until this transaction ends.
        const rows = await client.$queryRaw<DueRow[]>`
          SELECT id, type, payload, created_at, attempts
            FROM outbox_messages
           WHERE dispatched_at IS NULL
             AND available_at <= ${now}
             AND attempts < ${MAX_DISPATCH_ATTEMPTS}
           ORDER BY created_at, id
           LIMIT ${limit}
             FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return;

        // Types unknown to this build (a newer deploy wrote them) are left for it.
        const batch: OutboxMessage[] = rows
          .filter((row) => isOutboxType(row.type))
          .map((row) => ({
            id: row.id,
            type: row.type as OutboxType,
            payload: row.payload,
            createdAt: row.created_at,
            attempts: row.attempts,
          }));
        const outcomes = await process(batch);

        const attemptsById = new Map(batch.map((message) => [message.id, message.attempts]));
        for (const outcome of outcomes) {
          const state = recordAttempt(
            attemptsById.get(outcome.id) ?? 0,
            outcome.error === undefined ? {} : { error: outcome.error },
            now,
          );
          await client.outboxMessage.update({
            where: { id: outcome.id },
            data: {
              attempts: state.attempts,
              dispatchedAt: state.dispatchedAt,
              availableAt: state.availableAt,
              lastError: state.lastError,
            },
          });
        }
      },
      { timeout: 30_000, maxWait: 5_000 },
    );
  }

  async purgeDispatchedBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.outboxMessage.deleteMany({
      where: { dispatchedAt: { lt: cutoff } },
    });
    return result.count;
  }
}
