import { Inject, Injectable } from "@nestjs/common";
import { emailSchema, type OAuthProviderName, type PublicUser } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { accountNameFrom, type OAuthProfile } from "../domain/oauth.js";
import { newSocialUser, toPublicUser, type User } from "../domain/user.js";
import { OAuthProviderUnavailableError, ProviderEmailNotVerifiedError } from "./errors.js";
import {
  OAUTH_ACCOUNT_REPOSITORY,
  type OAuthAccountRepository,
} from "./ports/oauth-account-repository.js";
import {
  type CodeExchange,
  OAUTH_PROVIDERS,
  OAuthProviderError,
  type OAuthProviders,
} from "./ports/oauth-provider.js";
import {
  EmailAlreadyRegisteredError,
  USER_REPOSITORY,
  type UserRepository,
} from "./ports/user-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/** Another request linked the same provider account or took the e-mail meanwhile. */
class LostRaceError extends Error {}

/** One retry settles any race: afterwards the link or the account exists. */
const MAX_ATTEMPTS = 2;

interface Resolution {
  readonly user: User;
  readonly created: boolean;
  /** An existing account nobody had verified: now verified, and its password is gone. */
  readonly tookOver: boolean;
}

/**
 * Second half of a social login: trades the provider's code for the person's profile
 * and finds the Vira account it belongs to (ADR-0005, docs/SECURITY_MODEL.md 3.1):
 *
 * 1. A provider account linked before logs in to its account, whatever its e-mail is now.
 * 2. Otherwise the provider must vouch for the e-mail (Google `email_verified`, GitHub's
 *    verified primary address). Without that, nothing is matched or created: an
 *    unverified address would let anyone claim someone else's account.
 * 3. A verified e-mail that already has an account is linked to it. If that account was
 *    never verified, its password goes away: whoever registered it never proved the
 *    address, and could otherwise keep a way in after the real owner arrives.
 * 4. A new e-mail opens a new BUYER account, verified and without a password.
 *
 * Opening the session is the HTTP layer's job, as for the password login.
 */
@Injectable()
export class CompleteOAuthLogin {
  constructor(
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProviders,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(OAUTH_ACCOUNT_REPOSITORY) private readonly accounts: OAuthAccountRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws OAuthProviderUnavailableError for a provider that is off.
   * @throws OAuthProviderError when the provider does not confirm the code.
   * @throws ProviderEmailNotVerifiedError when there is no account to log in to and the
   *   provider does not vouch for the e-mail.
   */
  async execute(
    input: CodeExchange & { readonly provider: OAuthProviderName },
    context: RequestContext = {},
  ): Promise<PublicUser> {
    const provider = this.providers.get(input.provider);
    if (!provider) throw new OAuthProviderUnavailableError();

    const { code, codeVerifier, nonce, redirectUri } = input;
    const profile = await provider.profile({ code, codeVerifier, nonce, redirectUri });
    const user = await this.resolve(input.provider, profile, context);

    await this.audit.record(
      { action: "auth.login_succeeded", entityId: user.id, metadata: { method: input.provider } },
      { actor: { id: user.id, role: user.role }, ...withRequestId(context) },
    );
    return toPublicUser(user);
  }

  private async resolve(
    provider: OAuthProviderName,
    profile: OAuthProfile,
    context: RequestContext,
  ): Promise<User> {
    for (let attempt = 1; ; attempt++) {
      const linkedUserId = await this.accounts.findUserId(provider, profile.accountId);
      if (linkedUserId !== null) return this.existingUser(linkedUserId);

      const email = await this.verifiedEmailOf(profile, context);
      try {
        const resolution = await this.linkOrCreate(provider, profile, email);
        await this.recordLink(provider, resolution, context);
        return resolution.created ? resolution.user : await this.existingUser(resolution.user.id);
      } catch (error) {
        if (!(error instanceof LostRaceError) || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  private async existingUser(id: string): Promise<User> {
    const user = await this.users.findById(id);
    // Links cascade with their account, so this only happens if it was deleted just now.
    if (!user) throw new OAuthProviderError("Linked account no longer exists");
    return user;
  }

  /** The normalized e-mail, if the provider vouches for it and it is a usable address. */
  private async verifiedEmailOf(profile: OAuthProfile, context: RequestContext): Promise<string> {
    const email = profile.email === null ? null : emailSchema.safeParse(profile.email);
    if (profile.emailVerified && email?.success) return email.data;

    // Nobody proved who they are, and no account is looked up: the actor is the system.
    await this.audit.record(
      { action: "auth.login_failed", metadata: { reason: "provider_email_not_verified" } },
      { actor: "system", ...withRequestId(context) },
    );
    throw new ProviderEmailNotVerifiedError();
  }

  /** The account and its link are written together, or not at all. */
  private async linkOrCreate(
    provider: OAuthProviderName,
    profile: OAuthProfile,
    email: string,
  ): Promise<Resolution> {
    const now = this.clock.now();
    const existing = await this.users.findByEmail(email);
    try {
      return await this.transactions.run(async (tx) => {
        let resolution: Resolution;
        if (existing) {
          await this.users.confirmEmailThroughProvider(existing.id, now, tx);
          resolution = {
            user: existing,
            created: false,
            tookOver: existing.emailVerifiedAt === null,
          };
        } else {
          const user = newSocialUser({
            id: this.ids.next(),
            name: accountNameFrom(profile.name, email),
            email,
            now,
          });
          await this.users.create(user, tx);
          resolution = { user, created: true, tookOver: false };
        }

        const linked = await this.accounts.link(
          {
            id: this.ids.next(),
            userId: resolution.user.id,
            provider,
            providerAccountId: profile.accountId,
            createdAt: now,
          },
          tx,
        );
        if (!linked) throw new LostRaceError();
        return resolution;
      });
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) throw new LostRaceError();
      throw error;
    }
  }

  private async recordLink(
    provider: OAuthProviderName,
    { user, created, tookOver }: Resolution,
    context: RequestContext,
  ): Promise<void> {
    const as = { actor: { id: user.id, role: user.role }, ...withRequestId(context) } as const;
    if (created) {
      await this.audit.record({ action: "auth.registered", entityId: user.id, metadata: {} }, as);
    }
    if (tookOver) {
      await this.audit.record(
        { action: "auth.email_verified", entityId: user.id, metadata: {} },
        as,
      );
    }
    await this.audit.record(
      {
        action: "auth.oauth_linked",
        entityId: user.id,
        metadata: { provider, tookOverUnverified: tookOver },
      },
      as,
    );
  }
}
