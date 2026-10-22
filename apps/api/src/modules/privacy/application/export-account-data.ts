import { Inject, Injectable } from "@nestjs/common";
import { DATA_EXPORT_FORMAT, type DataExport, type Role } from "@vira/shared";

import {
  RATE_LIMITER,
  type RateLimiter,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { AccountNotFoundError } from "./errors.js";
import { PRIVACY_REPOSITORY, type PrivacyRepository } from "./ports/privacy-repository.js";
import { PRIVACY_RATE_LIMITS } from "./rate-limits.js";

/** The caller, as the access token describes them. */
export interface AccountHolder {
  readonly id: string;
  readonly role: Role;
}

export interface RequestContext {
  readonly requestId?: string;
}

/**
 * Access and portability (LGPD art. 18, II and V): everything the account holds, in one
 * documented JSON file. Audited, and limited per account.
 */
@Injectable()
export class ExportAccountData {
  constructor(
    @Inject(PRIVACY_REPOSITORY) private readonly privacy: PrivacyRepository,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws RateLimitExceededError after three exports in a day.
   * @throws AccountNotFoundError when the account behind the session is gone.
   */
  async execute(holder: AccountHolder, context: RequestContext = {}): Promise<DataExport> {
    const budget = await this.limiter.hit(PRIVACY_RATE_LIMITS.export, holder.id);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const now = this.clock.now();
    const data = await this.privacy.exportOf(holder.id, now);
    if (!data) throw new AccountNotFoundError();

    await this.audit.record(
      { action: "user.data_exported", entityId: holder.id, metadata: {} },
      { actor: holder, ...context },
    );
    return { format: DATA_EXPORT_FORMAT, exportedAt: now.toISOString(), ...data };
  }
}
