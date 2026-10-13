import { Injectable } from "@nestjs/common";

import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { ActiveSession, SessionRepository } from "../application/ports/session-repository.js";
import type { Session, SessionRevokeReason } from "../domain/session.js";

/** Rows that can still be exchanged for a new token. */
const usable = (now: Date) => ({ rotatedAt: null, revokedAt: null, expiresAt: { gt: now } });

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: Session, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).session.create({
      data: {
        id: session.id,
        userId: session.userId,
        familyId: session.familyId,
        tokenHash: new Uint8Array(session.tokenHash),
        authenticatedAt: session.authenticatedAt,
        createdAt: session.createdAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        expiresAt: session.expiresAt,
      },
    });
  }

  async findByTokenHash(tokenHash: Buffer): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: new Uint8Array(tokenHash) },
    });
    if (!row) return null;
    return Object.freeze({
      id: row.id,
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: Buffer.from(row.tokenHash),
      authenticatedAt: row.authenticatedAt,
      createdAt: row.createdAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      expiresAt: row.expiresAt,
      rotatedAt: row.rotatedAt,
      revokedAt: row.revokedAt,
    });
  }

  async markRotated(id: string, now: Date, tx?: TransactionContext): Promise<boolean> {
    // A single conditional UPDATE: whatever two concurrent requests read before, only
    // one of them changes the row.
    const { count } = await clientFor(this.prisma, tx).session.updateMany({
      where: { id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: now },
    });
    return count === 1;
  }

  async revokeFamily(familyId: string, reason: SessionRevokeReason, now: Date): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now, revokeReason: reason },
    });
    return count;
  }

  async revokeActiveFamilyOf(
    userId: string,
    familyId: string,
    reason: SessionRevokeReason,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (client) => {
      const active = await client.session.count({ where: { userId, familyId, ...usable(now) } });
      if (active === 0) return false;
      await client.session.updateMany({
        where: { userId, familyId, revokedAt: null },
        data: { revokedAt: now, revokeReason: reason },
      });
      return true;
    });
  }

  async revokeAllOf(userId: string, reason: SessionRevokeReason, now: Date): Promise<number> {
    return this.prisma.$transaction(async (client) => {
      const active = await client.session.findMany({
        where: { userId, ...usable(now) },
        select: { familyId: true },
        distinct: ["familyId"],
      });
      await client.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: reason },
      });
      return active.length;
    });
  }

  async listActive(userId: string, now: Date): Promise<ActiveSession[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId, ...usable(now) },
      orderBy: [{ authenticatedAt: "desc" }, { familyId: "asc" }],
      select: { familyId: true, authenticatedAt: true, createdAt: true, expiresAt: true },
    });
    return rows.map((row) => ({
      id: row.familyId,
      authenticatedAt: row.authenticatedAt,
      lastRefreshedAt: row.createdAt,
      expiresAt: row.expiresAt,
    }));
  }
}
