/** The account behind the session is gone (deleted meanwhile). */
export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found");
    this.name = "AccountNotFoundError";
  }
}

/**
 * An organizer with published events still to come cannot leave: the buyers of those
 * events would lose who answers for them. The events must be canceled first.
 */
export class OrganizerHasUpcomingEventsError extends Error {
  constructor() {
    super("Organizer has upcoming published events");
    this.name = "OrganizerHasUpcomingEventsError";
  }
}
