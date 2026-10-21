import { Inject, Injectable } from "@nestjs/common";

import type { Ticket } from "../domain/ticket.js";
import { TicketNotFoundError } from "./errors.js";
import { TICKET_REPOSITORY, type TicketRepository } from "./ports/ticket-repository.js";
import { QrTokens } from "./qr-tokens.js";

/** One of the caller's own tickets, with its QR token: the only place the token is given. */
@Injectable()
export class GetTicket {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    private readonly qrTokens: QrTokens,
  ) {}

  /** @throws TicketNotFoundError when there is no such ticket or it is someone else's. */
  async execute(
    caller: { readonly id: string },
    ticketId: string,
  ): Promise<{ ticket: Ticket; qrToken: string }> {
    const ticket = await this.tickets.findOwned(ticketId, caller.id);
    if (!ticket) throw new TicketNotFoundError();
    return { ticket, qrToken: this.qrTokens.tokenFor(ticket) };
  }
}
