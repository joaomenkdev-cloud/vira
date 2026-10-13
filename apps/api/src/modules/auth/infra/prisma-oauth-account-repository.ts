import { Injectable } from "@nestjs/common";
import type { OAuthProviderName } from "@vira/shared";

import type { OAuthProvider as ProviderColumn } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type { OAuthAccountRepository } from "../application/ports/oauth-account-repository.js";
import type { OAuthAccount } from "../domain/oauth.js";

const COLUMN: Readonly<Record<OAuthProviderName, ProviderColumn>> = {
  google: "GOOGLE",
  github: "GITHUB",
};

@Injectable()
export class PrismaOAuthAccountRepository implements OAuthAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserId(provider: OAuthProviderName, providerAccountId: string): Promise<string | null> {
    const row = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider: COLUMN[provider], providerAccountId } },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  async link(account: OAuthAccount, tx?: TransactionContext): Promise<boolean> {
    // INSERT ... ON CONFLICT DO NOTHING: a link made a moment ago by a concurrent
    // request shows up as a zero count instead of aborting the transaction.
    const { count } = await clientFor(this.prisma, tx).oAuthAccount.createMany({
      data: [
        {
          id: account.id,
          userId: account.userId,
          provider: COLUMN[account.provider],
          providerAccountId: account.providerAccountId,
          createdAt: account.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    return count > 0;
  }
}
