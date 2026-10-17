import { Inject, Injectable } from "@nestjs/common";
import type { CancelEventRequest } from "@vira/shared";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { type Event, hasEnded } from "../domain/event.js";
import { EventNotFoundError, InvalidTransitionError } from "./errors.js";
import {
  auditContext,
  type Caller,
  OrganizerScope,
  type RequestContext,
} from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";

/**
 * PUBLISHED → CANCELED, with a reason for the buyers. Final: a canceled event is never
 * published again. Refunding its orders comes with the payments (Marco 2).
 */
@Injectable()
export class CancelEvent {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly scope: OrganizerScope,
    private readonly audit: AuditLog,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when it is a draft, already canceled or over.
   */
  async execute(
    caller: Caller,
    eventId: string,
    request: CancelEventRequest,
    context: RequestContext = {},
  ): Promise<Event> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    if (event.status === "DRAFT") {
      throw new InvalidTransitionError("Um rascunho não é cancelado: exclua-o.");
    }
    if (event.status === "CANCELED") throw new InvalidTransitionError("O evento já foi cancelado.");
    if (hasEnded(event, now)) throw new InvalidTransitionError("O evento já terminou.");
    // The update checks the status again, so a concurrent cancel wins only once.
    if (!(await this.events.cancel(eventId, { reason: request.reason, canceledAt: now }))) {
      throw new InvalidTransitionError("O evento já foi cancelado.");
    }

    await this.audit.record(
      { action: "event.canceled", entityId: eventId, metadata: {} },
      auditContext(caller, context),
    );
    const canceled = await this.events.findOwned(eventId, organizerId);
    if (!canceled) throw new EventNotFoundError();
    return canceled;
  }
}
