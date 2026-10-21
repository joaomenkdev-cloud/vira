import { Inject, Injectable } from "@nestjs/common";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { editRefusal, missingForPublication } from "../domain/event.js";
import {
  InvalidTransitionError,
  InventoryConflictError,
  TicketTypeNotFoundError,
} from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";

/**
 * Deletes a ticket type nobody holds. One with sales or reservations stays: orders and
 * tickets point at it. A published event keeps at least one.
 */
@Injectable()
export class DeleteTicketType {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly scope: OrganizerScope,
  ) {}

  /**
   * @throws TicketTypeNotFoundError when there is no such ticket type or its event is
   *   someone else's.
   * @throws InvalidTransitionError when the event is canceled or ended, or it is the
   *   last ticket type of a published event.
   * @throws InventoryConflictError when tickets of it are sold, reserved or were ever ordered.
   */
  async execute(caller: Caller, ticketTypeId: string): Promise<void> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    await this.transactions.run(async (tx) => {
      const event = await this.events.findOwnedByTicketType(ticketTypeId, organizerId, {
        tx,
        lock: true,
      });
      if (!event) throw new TicketTypeNotFoundError();
      const refusal = editRefusal(event, now);
      if (refusal) throw new InvalidTransitionError(refusal);
      if (event.status === "PUBLISHED") {
        const remaining = event.ticketTypes.filter((t) => t.id !== ticketTypeId);
        const missing = missingForPublication({ ...event, ticketTypes: remaining }, now);
        if (missing.some((m) => m.path === "ticketTypes")) {
          throw new InvalidTransitionError(
            "Um evento publicado precisa de ao menos um tipo de ingresso.",
            missing,
          );
        }
      }
      if (!(await this.events.deleteUnsoldTicketType(ticketTypeId, tx))) {
        throw new InventoryConflictError(
          "Este tipo de ingresso já tem vendas, reservas ou pedidos e não pode ser excluído.",
        );
      }
    });
  }
}
