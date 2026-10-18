import { Inject, Injectable } from "@nestjs/common";
import type { EventStatus } from "@vira/shared";

import {
  EVENT_REPOSITORY,
  type EventListPosition,
  type EventRepository,
  type EventSummary,
} from "./ports/event-repository.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";

export interface EventPage {
  readonly events: readonly EventSummary[];
  /** Where the next page starts, or `null` on the last one. */
  readonly next: EventListPosition | null;
}

/** The organizer's own events, newest first, a page at a time. */
@Injectable()
export class ListOrganizerEvents {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    private readonly scope: OrganizerScope,
  ) {}

  async execute(
    caller: Caller,
    query: {
      readonly status?: EventStatus;
      readonly after?: EventListPosition;
      readonly limit: number;
    },
  ): Promise<EventPage> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const rows = await this.events.listOwned(organizerId, query);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      events: page,
      next: rows.length > query.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
