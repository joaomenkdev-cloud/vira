import { Inject, Injectable } from "@nestjs/common";
import type { UpdateTicketTypeRequest } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { editRefusal, type TicketType } from "../domain/event.js";
import {
  InvalidTransitionError,
  InventoryConflictError,
  TicketTypeNotFoundError,
} from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import {
  EVENT_REPOSITORY,
  type EventRepository,
  type TicketTypeChanges,
} from "./ports/event-repository.js";
import { checkSalesWindow } from "./ticket-type-rules.js";

const optionalDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

/** Edits a ticket type. Its capacity never drops below what is sold or reserved. */
@Injectable()
export class UpdateTicketType {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly scope: OrganizerScope,
  ) {}

  /**
   * @throws TicketTypeNotFoundError when there is no such ticket type or its event is
   *   someone else's.
   * @throws InvalidTransitionError when the event is canceled or ended.
   * @throws InventoryConflictError when the capacity would fall below sold + reserved.
   * @throws InvalidEventInputError when the sales window does not fit the event.
   */
  async execute(
    caller: Caller,
    ticketTypeId: string,
    request: UpdateTicketTypeRequest,
  ): Promise<TicketType> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    return this.transactions.run(async (tx) => {
      const event = await this.events.findOwnedByTicketType(ticketTypeId, organizerId, {
        tx,
        lock: true,
      });
      const current = event?.ticketTypes.find((t) => t.id === ticketTypeId);
      if (!event || !current) throw new TicketTypeNotFoundError();
      const refusal = editRefusal(event, now);
      if (refusal) throw new InvalidTransitionError(refusal);

      const salesStartAt = optionalDate(request.salesStartAt);
      const salesEndAt = optionalDate(request.salesEndAt);
      const changes: TicketTypeChanges = {
        ...(request.name === undefined ? {} : { name: request.name }),
        ...(request.description === undefined ? {} : { description: request.description }),
        ...(request.priceCents === undefined ? {} : { priceCents: request.priceCents }),
        ...(request.capacity === undefined ? {} : { capacity: request.capacity }),
        ...(request.maxPerOrder === undefined ? {} : { maxPerOrder: request.maxPerOrder }),
        ...(salesStartAt === undefined ? {} : { salesStartAt }),
        ...(salesEndAt === undefined ? {} : { salesEndAt }),
        ...(request.sortOrder === undefined ? {} : { sortOrder: request.sortOrder }),
      };
      const updated: TicketType = { ...current, ...changes };
      checkSalesWindow(event, updated);

      const outcome = await this.events.updateTicketType(ticketTypeId, changes, tx);
      if (outcome === "below-committed") {
        throw new InventoryConflictError(
          `A capacidade não pode ser menor que os ${current.sold + current.reserved} ingressos ` +
            "já vendidos ou reservados.",
        );
      }
      return updated;
    });
  }
}
