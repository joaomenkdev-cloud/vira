import { Inject, Injectable } from "@nestjs/common";
import type { BecomeOrganizerRequest, Role } from "@vira/shared";

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
import type { OrganizerProfile } from "../domain/account.js";
import { slugCandidates, slugFrom } from "../domain/organizer-slug.js";
import { AccountNotFoundError, AlreadyOrganizerError } from "./errors.js";
import { ACCOUNT_REPOSITORY, type AccountRepository } from "./ports/account-repository.js";

/** The caller, as the access token describes them. */
export interface Caller {
  readonly id: string;
  readonly role: Role;
}

/**
 * Self-service organizer sign-up (ADR-0005: "ORGANIZER é obtido por autosserviço"):
 * creates the account's organizer profile and makes a BUYER an ORGANIZER, together.
 * The new role reaches the access token on the next refresh, which rereads it.
 */
@Injectable()
export class BecomeOrganizer {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws AlreadyOrganizerError when the account already has a profile.
   * @throws AccountNotFoundError when the account behind the session is gone.
   */
  async execute(
    caller: Caller,
    request: BecomeOrganizerRequest,
    context: { readonly requestId?: string } = {},
  ): Promise<OrganizerProfile> {
    const account = await this.accounts.findById(caller.id);
    if (!account) throw new AccountNotFoundError();
    if (account.organizer) throw new AlreadyOrganizerError();

    // The last part of a fresh id (random in UUIDv7) makes the last candidate unique.
    const randomSuffix = this.ids.next().replaceAll("-", "").slice(-6);
    const profile = await this.transactions.run(async (tx) => {
      for (const slug of slugCandidates(slugFrom(request.displayName), randomSuffix)) {
        const candidate: OrganizerProfile = {
          id: this.ids.next(),
          userId: account.id,
          displayName: request.displayName,
          slug,
          createdAt: this.clock.now(),
        };
        const outcome = await this.accounts.createOrganizerProfile(candidate, tx);
        if (outcome === "account-has-profile") throw new AlreadyOrganizerError();
        if (outcome === "created") {
          await this.accounts.promoteToOrganizer(account.id, tx);
          return candidate;
        }
      }
      throw new Error("No free organizer slug");
    });

    await this.audit.record(
      { action: "user.organizer_profile_created", entityId: account.id, metadata: {} },
      {
        actor: { id: caller.id, role: caller.role },
        ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
      },
    );
    return profile;
  }
}
