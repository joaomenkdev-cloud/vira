import { Injectable } from "@nestjs/common";

import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  AccountRepository,
  CreateProfileOutcome,
} from "../application/ports/account-repository.js";
import type { Account, OrganizerProfile } from "../domain/account.js";

/**
 * Reads the `users` row and the organizer profile. Of the `users` row this module
 * writes only `name` and `role`; the credential columns are the `auth` module's
 * (docs/ARCHITECTURE.md#3-módulos-de-negócio).
 */
@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Account | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerifiedAt: true,
        passwordHash: true,
        organizerProfile: true,
      },
    });
    if (!row) return null;
    const profile = row.organizerProfile;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      emailVerified: row.emailVerifiedAt !== null,
      hasPassword: row.passwordHash !== null,
      organizer: profile && {
        id: profile.id,
        userId: profile.userId,
        displayName: profile.displayName,
        slug: profile.slug,
        createdAt: profile.createdAt,
      },
    };
  }

  async rename(id: string, name: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({ where: { id }, data: { name } });
    return count === 1;
  }

  async createOrganizerProfile(
    profile: OrganizerProfile,
    tx?: TransactionContext,
  ): Promise<CreateProfileOutcome> {
    const client = clientFor(this.prisma, tx);
    // INSERT ... ON CONFLICT DO NOTHING: a conflict on either unique index (the user's
    // or the slug's) skips the row instead of aborting the transaction.
    const { count } = await client.organizerProfile.createMany({
      data: [
        {
          id: profile.id,
          userId: profile.userId,
          displayName: profile.displayName,
          slug: profile.slug,
          createdAt: profile.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 1) return "created";
    const existing = await client.organizerProfile.findUnique({
      where: { userId: profile.userId },
      select: { id: true },
    });
    return existing ? "account-has-profile" : "slug-taken";
  }

  async promoteToOrganizer(userId: string, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).user.updateMany({
      where: { id: userId, role: "BUYER" },
      data: { role: "ORGANIZER" },
    });
  }
}
