/** The e-mail/password pair is not acceptable. Deliberately says nothing about why. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

/** Right password, but the e-mail was never verified. Only shown to someone who knew the password. */
export class EmailNotVerifiedError extends Error {
  constructor() {
    super("E-mail not verified");
    this.name = "EmailNotVerifiedError";
  }
}

/** The token is unknown, already used or expired; the client cannot tell which. */
export class InvalidTokenError extends Error {
  constructor() {
    super("Invalid or expired token");
    this.name = "InvalidTokenError";
  }
}
