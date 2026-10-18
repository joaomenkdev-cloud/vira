import { Inject, Injectable } from "@nestjs/common";
import type { CreateTicketTypeRequest } from "@vira/shared";

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
import { editRefusal, type TicketType } from "../domain/event.js";
import { EventNotFoundError, InvalidTransitionError } from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";
import { checkSalesWindow, MAX_TICKET_TYPES_PER_EVENT } from "./ticket-type-rules.js";

/** Adds a ticket type at the end of the event's list. */
@Injectable()
export class CreateTicketType {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly scope: OrganizerScope,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when the event is canceled, ended or already has the
   *   most ticket types allowed.
   * @throws InvalidEventInputError when the sales window does not fit the event.
   */
  async execute(
    caller: Caller,
    eventId: string,
    request: CreateTicketTypeRequest,
  ): Promise<TicketType> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    return this.transactions.run(async (tx) => {
      const event = await this.events.findOwned(eventId, organizerId, { tx, lock: true });
      if (!event) throw new EventNotFoundError();
      const refusal = editRefusal(event, now);
      if (refusal) throw new InvalidTransitionError(refusal);
      if (event.ticketTypes.length >= MAX_TICKET_TYPES_PER_EVENT) {
        throw new InvalidTransitionError(
          `Um evento tem no máximo ${MAX_TICKET_TYPES_PER_EVENT} tipos de ingresso.`,
        );
      }
      const salesStartAt = request.salesStartAt ? new Date(request.salesStartAt) : null;
      const salesEndAt = request.salesEndAt ? new Date(request.salesEndAt) : null;
      checkSalesWindow(event, { salesStartAt, salesEndAt });

      const ticketType: TicketType = {
        id: this.ids.next(),
        eventId,
        name: request.name,
        description: request.description ?? null,
        priceCents: request.priceCents,
        capacity: request.capacity,
        sold: 0,
        reserved: 0,
        maxPerOrder: request.maxPerOrder,
        salesStartAt,
        salesEndAt,
        sortOrder: Math.max(-1, ...event.ticketTypes.map((t) => t.sortOrder)) + 1,
        createdAt: now,
      };
      const { sold: _sold, reserved: _reserved, ...row } = ticketType;
      await this.events.createTicketType(row, tx);
      return ticketType;
    });
  }
}
