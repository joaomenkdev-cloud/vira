/** The account behind the session no longer exists. */
export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found");
    this.name = "AccountNotFoundError";
  }
}

/** The account already has an organizer profile (there is at most one). */
export class AlreadyOrganizerError extends Error {
  constructor() {
    super("Account already has an organizer profile");
    this.name = "AlreadyOrganizerError";
  }
}
