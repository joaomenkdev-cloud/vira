import { Injectable } from "@nestjs/common";

import type { User as UserRow } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import {
  EmailAlreadyRegisteredError,
  type UserRepository,
} from "../application/ports/user-repository.js";
import type { User } from "../domain/user.js";

function toDomain(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    role: row.role,
    emailVerifiedAt: row.emailVerifiedAt,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row && toDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row && toDomain(row);
  }

  async create(user: User, tx?: TransactionContext): Promise<void> {
    // INSERT ... ON CONFLICT DO NOTHING: a taken e-mail (even one taken a moment ago by
    // a concurrent request) is reported by the row count instead of a failed statement,
    // which would also abort the surrounding transaction.
    const { count } = await clientFor(this.prisma, tx).user.createMany({
      data: [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          role: user.role,
          emailVerifiedAt: user.emailVerifiedAt,
          failedLoginCount: user.failedLoginCount,
          lockedUntil: user.lockedUntil,
          createdAt: user.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) throw new EmailAlreadyRegisteredError();
  }

  async markEmailVerified(userId: string, at: Date, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: at },
    });
  }

  async recordFailedLogin(userId: string): Promise<number> {
    // One UPDATE ... SET n = n + 1 RETURNING n: concurrent failures never share a count.
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return row.failedLoginCount;
  }

  async lockUntil(userId: string, until: Date): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: until } }] },
      data: { lockedUntil: until },
    });
  }

  async clearLoginFailures(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
