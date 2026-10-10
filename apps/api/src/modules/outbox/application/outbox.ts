import { Inject, Injectable } from "@nestjs/common";

import type { TransactionContext } from "../../../platform/database/transaction.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { buildOutboxMessage, type OutboxEvent } from "../domain/outbox-message.js";
import { OUTBOX_REPOSITORY, type OutboxRepository } from "./ports/outbox-repository.js";

/**
 * Records a side effect (a queue job) to be dispatched after the current
 * transaction commits. Pass the transaction that changes the state the effect
 * depends on: if it rolls back, the message never exists.
 */
@Injectable()
export class Outbox {
  constructor(
    @Inject(OUTBOX_REPOSITORY) private readonly repository: OutboxRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async publish(event: OutboxEvent, tx?: TransactionContext): Promise<void> {
    const message = buildOutboxMessage(event, {
      id: this.ids.next(),
      createdAt: this.clock.now(),
    });
    await this.repository.append(message, tx);
  }
}
