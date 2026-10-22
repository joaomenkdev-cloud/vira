import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { retentionCutoffs } from "../domain/anonymization.js";
import {
  PRIVACY_REPOSITORY,
  type PrivacyRepository,
  type RetentionSummary,
} from "./ports/privacy-repository.js";

/**
 * The retention rules of docs/PRIVACY.md#5-retenção-automática, all at once: holder
 * names and door reads 90 days after the event, expired sessions and links, buyer data
 * on orders older than five years, applied Stripe events after 90 days. Every rule is
 * idempotent, so a round can run as often as wanted.
 */
@Injectable()
export class ApplyRetention {
  constructor(
    @Inject(PRIVACY_REPOSITORY) private readonly privacy: PrivacyRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<RetentionSummary> {
    return this.privacy.applyRetention(retentionCutoffs(this.clock.now()));
  }
}
