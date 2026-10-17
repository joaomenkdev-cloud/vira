import { Inject, Injectable } from "@nestjs/common";

import { EventNotFoundError, InvalidTransitionError } from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";

/**
 * Deletes a draft, ticket types included. A published event is canceled instead: people
 * may have bought tickets, and its history stays.
 */
@Injectable()
export class DeleteDraftEvent {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly scope: OrganizerScope,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when the event is no longer a draft.
   */
  async execute(caller: Caller, eventId: string): Promise<void> {
    const organizerId = await this.scope.organizerIdOf(caller);
    // The delete itself checks the status, so a publication in between is never undone.
    if (await this.events.deleteDraft(eventId, organizerId)) return;
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    throw new InvalidTransitionError(
      "Só rascunhos podem ser excluídos. Um evento publicado é cancelado.",
    );
  }
}
