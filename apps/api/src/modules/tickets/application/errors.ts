/** No such ticket, or it is someone else's: the same answer for both. */
export class TicketNotFoundError extends Error {
  constructor() {
    super("Ticket not found");
    this.name = "TicketNotFoundError";
  }
}
