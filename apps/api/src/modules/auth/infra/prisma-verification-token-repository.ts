import { Injectable } from "@nestjs/common";

import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { VerificationTokenRepository } from "../application/ports/verification-token-repository.js";
import type { TokenPurpose, VerificationToken } from "../domain/verification-token.js";

@Injectable()
export class PrismaVerificationTokenRepository implements VerificationTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceUnused(token: VerificationToken): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.verificationToken.deleteMany({
        where: { userId: token.userId, purpose: token.purpose, usedAt: null },
      }),
      this.prisma.verificationToken.create({
        data: {
          id: token.id,
          userId: token.userId,
          purpose: token.purpose,
          tokenHash: new Uint8Array(token.tokenHash),
          expiresAt: token.expiresAt,
          createdAt: token.createdAt,
        },
      }),
    ]);
  }

  async consume(
    tokenHash: Buffer,
    purpose: TokenPurpose,
    now: Date,
    tx?: TransactionContext,
  ): Promise<{ readonly userId: string } | null> {
    const client = clientFor(this.prisma, tx);
    const hash = new Uint8Array(tokenHash);

    const row = await client.verificationToken.findUnique({
      where: { tokenHash: hash },
      select: { userId: true },
    });
    if (!row) return null;

    // The claim itself is a single conditional UPDATE: of two requests carrying the same
    // token at once, exactly one changes a row, whatever the lookup above saw.
    const { count } = await client.verificationToken.updateMany({
      where: { tokenHash: hash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return count === 1 ? { userId: row.userId } : null;
  }
}
