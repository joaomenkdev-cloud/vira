import { Inject, Injectable } from "@nestjs/common";
import type { CreateEventRequest } from "@vira/shared";

import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import type { Event } from "../domain/event.js";
import { eventSlug } from "../domain/event-slug.js";
import { type Caller, OrganizerScope, slugSuffix } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";
import { MARKDOWN_RENDERER, type MarkdownRenderer } from "./ports/markdown-renderer.js";

/** A random suffix collides about once in 16 million; three tries are plenty. */
const SLUG_ATTEMPTS = 3;

/**
 * Starts a draft. A draft may lack the venue, the image and the ticket types; what
 * publication needs is checked when publishing (PublishEvent).
 */
@Injectable()
export class CreateEvent {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(MARKDOWN_RENDERER) private readonly markdown: MarkdownRenderer,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly scope: OrganizerScope,
  ) {}

  /** @throws NotOrganizerError when the caller has no organizer profile. */
  async execute(caller: Caller, request: CreateEventRequest): Promise<Event> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const id = this.ids.next();
    const fields = {
      id,
      organizerId,
      title: request.title,
      descriptionMd: request.descriptionMd,
      descriptionHtml: this.markdown.render(request.descriptionMd),
      startsAt: new Date(request.startsAt),
      endsAt: new Date(request.endsAt),
      timezone: request.timezone,
      venue: request.venue ?? null,
      createdAt: this.clock.now(),
    };
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const slug = eventSlug(request.title, slugSuffix(this.ids.next()));
      if (await this.events.create({ ...fields, slug })) {
        const event = await this.events.findOwned(id, organizerId);
        if (!event) throw new Error("Event vanished right after its creation");
        return event;
      }
    }
    throw new Error("No free event slug");
  }
}
