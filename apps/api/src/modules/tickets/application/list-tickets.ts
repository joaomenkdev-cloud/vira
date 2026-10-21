import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import {
  TICKET_REPOSITORY,
  type TicketCursor,
  type TicketPage,
  type TicketRepository,
} from "./ports/ticket-repository.js";

/** The caller's tickets, upcoming or past, a page at a time. */
@Injectable()
export class ListTickets {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(
    caller: { readonly id: string },
    query: {
      readonly when: "upcoming" | "past";
      readonly limit: number;
      readonly after?: TicketCursor;
    },
  ): Promise<TicketPage> {
    return this.tickets.listOwned(caller.id, { ...query, now: this.clock.now() });
  }
}
