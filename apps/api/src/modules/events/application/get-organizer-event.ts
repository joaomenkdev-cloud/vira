import { Inject, Injectable } from "@nestjs/common";

import type { Event } from "../domain/event.js";
import { EventNotFoundError } from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";

/** One of the organizer's own events, ticket types included. */
@Injectable()
export class GetOrganizerEvent {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly scope: OrganizerScope,
  ) {}

  /** @throws EventNotFoundError when there is no such event or it is someone else's. */
  async execute(caller: Caller, eventId: string): Promise<Event> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    return event;
  }
}
