/** No such event, someone else's, or the caller is no organizer: the same answer for all. */
export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}
