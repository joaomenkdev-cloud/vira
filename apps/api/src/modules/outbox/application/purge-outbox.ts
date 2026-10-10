import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { DISPATCHED_RETENTION_MS } from "../domain/retry-policy.js";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "./ports/outbox-repository.js";

/** Deletes delivered messages once the retention period has passed (docs/PRIVACY.md). */
@Injectable()
export class PurgeOutbox {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly repository: OutboxRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - DISPATCHED_RETENTION_MS);
    return this.repository.purgeDispatchedBefore(cutoff);
  }
}
