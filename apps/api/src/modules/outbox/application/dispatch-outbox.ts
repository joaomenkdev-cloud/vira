import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { describeFailure } from "../domain/retry-policy.js";
import { MESSAGE_PUBLISHER, type MessagePublisher } from "./ports/message-publisher.js";
import {
  type DispatchOutcome,
  OUTBOX_REPOSITORY,
  type OutboxRepository,
} from "./ports/outbox-repository.js";

export const DISPATCH_BATCH_SIZE = 50;

export interface DispatchSummary {
  readonly dispatched: number;
  readonly failed: number;
}

/**
 * Moves due outbox messages to their queues. A failure on one message never stops
 * the others: it is recorded and retried later with backoff.
 */
@Injectable()
export class DispatchOutbox {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly repository: OutboxRepository,
    @Inject(MESSAGE_PUBLISHER) private readonly publisher: MessagePublisher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<DispatchSummary> {
    let outcomes: readonly DispatchOutcome[] = [];

    await this.repository.processDue(DISPATCH_BATCH_SIZE, this.clock.now(), async (batch) => {
      const results: DispatchOutcome[] = [];
      for (const message of batch) {
        try {
          await this.publisher.publish(message);
          results.push({ id: message.id });
        } catch (error) {
          results.push({ id: message.id, error: describeFailure(error) });
        }
      }
      outcomes = results;
      return results;
    });

    const failed = outcomes.filter((outcome) => outcome.error !== undefined).length;
    return { dispatched: outcomes.length - failed, failed };
  }
}
