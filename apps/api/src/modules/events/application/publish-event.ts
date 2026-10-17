import { Inject, Injectable } from "@nestjs/common";

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
import { type Event, missingForPublication } from "../domain/event.js";
import { eventSlug } from "../domain/event-slug.js";
import { EventNotFoundError, InvalidTransitionError } from "./errors.js";
import {
  auditContext,
  type Caller,
  OrganizerScope,
  type RequestContext,
  slugSuffix,
} from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";

const SLUG_ATTEMPTS = 3;

/**
 * DRAFT → PUBLISHED, once the event is complete (docs/DATA_MODEL.md#events). The slug is
 * made again from the final title, since drafts are often renamed; from here on it is
 * the event's public address and does not change.
 */
@Injectable()
export class PublishEvent {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly scope: OrganizerScope,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when it is not a draft, or with what it still lacks.
   */
  async execute(caller: Caller, eventId: string, context: RequestContext = {}): Promise<Event> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    await this.transactions.run(async (tx) => {
      // Locked: no ticket type can be deleted between the check and the publication.
      const event = await this.events.findOwned(eventId, organizerId, { tx, lock: true });
      if (!event) throw new EventNotFoundError();
      if (event.status !== "DRAFT") {
        throw new InvalidTransitionError("Só rascunhos podem ser publicados.");
      }
      const missing = missingForPublication(event, now);
      if (missing.length > 0) {
        throw new InvalidTransitionError("O evento ainda não pode ser publicado.", missing);
      }
      for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
        const slug = eventSlug(event.title, slugSuffix(this.ids.next()));
        const outcome = await this.events.publish(eventId, { slug, publishedAt: now }, tx);
        if (outcome === "published") return;
        if (outcome === "not-draft") {
          throw new InvalidTransitionError("Só rascunhos podem ser publicados.");
        }
      }
      throw new Error("No free event slug");
    });

    await this.audit.record(
      { action: "event.published", entityId: eventId, metadata: {} },
      auditContext(caller, context),
    );
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    return event;
  }
}
