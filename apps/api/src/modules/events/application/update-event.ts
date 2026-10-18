import { Inject, Injectable } from "@nestjs/common";
import type { UpdateEventRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { editRefusal, type Event, missingForPublication } from "../domain/event.js";
import { EventNotFoundError, InvalidEventInputError, InvalidTransitionError } from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import {
  EVENT_REPOSITORY,
  type EventChanges,
  type EventRepository,
} from "./ports/event-repository.js";
import { MARKDOWN_RENDERER, type MarkdownRenderer } from "./ports/markdown-renderer.js";

/**
 * Edits an event's details. Drafts take anything; a published event must stay
 * publishable (no clearing the venue, no moving it to the past); canceled and ended
 * events are final.
 */
@Injectable()
export class UpdateEvent {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(MARKDOWN_RENDERER) private readonly markdown: MarkdownRenderer,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly scope: OrganizerScope,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when the event is canceled or ended, or the change
   *   would leave a published event incomplete.
   * @throws InvalidEventInputError when the new end is not after the start.
   */
  async execute(caller: Caller, eventId: string, request: UpdateEventRequest): Promise<Event> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    await this.transactions.run(async (tx) => {
      const event = await this.events.findOwned(eventId, organizerId, { tx, lock: true });
      if (!event) throw new EventNotFoundError();
      const refusal = editRefusal(event, now);
      if (refusal) throw new InvalidTransitionError(refusal);

      const changes = this.changesFrom(request);
      const updated: Event = { ...event, ...changes };
      if (updated.endsAt <= updated.startsAt) {
        throw new InvalidEventInputError("endsAt", "o fim deve ser depois do início");
      }
      if (event.status === "PUBLISHED") {
        const missing = missingForPublication(updated, now);
        if (missing.length > 0) {
          throw new InvalidTransitionError(
            "Um evento publicado precisa continuar completo.",
            missing,
          );
        }
      }
      await this.events.update(eventId, changes, tx);
    });
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    return event;
  }

  private changesFrom(request: UpdateEventRequest): EventChanges {
    return {
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.descriptionMd === undefined
        ? {}
        : {
            descriptionMd: request.descriptionMd,
            descriptionHtml: this.markdown.render(request.descriptionMd),
          }),
      ...(request.startsAt === undefined ? {} : { startsAt: new Date(request.startsAt) }),
      ...(request.endsAt === undefined ? {} : { endsAt: new Date(request.endsAt) }),
      ...(request.timezone === undefined ? {} : { timezone: request.timezone }),
      ...(request.venue === undefined ? {} : { venue: request.venue }),
    };
  }
}
