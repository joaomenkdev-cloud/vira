import { Inject, Injectable } from "@nestjs/common";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { AccountNotFoundError, OrganizerHasUpcomingEventsError } from "./errors.js";
import type { AccountHolder, RequestContext } from "./export-account-data.js";
import { PRIVACY_REPOSITORY, type PrivacyRepository } from "./ports/privacy-repository.js";

/**
 * Elimination (LGPD art. 18, VI), as anonymization: the account and every copy of its
 * name and e-mail are overwritten in one transaction; sessions, social logins and
 * pending links are deleted; tickets for events still to come are canceled. Money
 * records (amounts, dates, Stripe ids) stay, pointing at no one. Whoever calls this has
 * already confirmed it is the account holder (`auth`, `DELETE /me`).
 */
@Injectable()
export class EraseAccount {
  constructor(
    @Inject(PRIVACY_REPOSITORY) private readonly privacy: PrivacyRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws OrganizerHasUpcomingEventsError while a published event of theirs has not ended.
   * @throws AccountNotFoundError when there is no such account, or it was already erased.
   */
  async execute(holder: AccountHolder, context: RequestContext = {}): Promise<void> {
    const now = this.clock.now();
    const result = await this.transactions.run((tx) => this.privacy.erase(holder.id, now, tx));
    if (result === "upcoming-events") throw new OrganizerHasUpcomingEventsError();
    if (result === "missing") throw new AccountNotFoundError();

    // The actor id stays in the log: pseudonymous, it no longer leads to a person.
    await this.audit.record(
      { action: "user.anonymized", entityId: holder.id, metadata: {} },
      { actor: holder, ...context },
    );
  }
}
