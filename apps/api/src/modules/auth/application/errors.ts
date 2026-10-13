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

/** No usable session for this refresh token: unknown, expired, revoked or reused. */
export class InvalidSessionError extends Error {
  constructor() {
    super("Invalid session");
    this.name = "InvalidSessionError";
  }
}

/** No active session with this id belongs to the caller. */
export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

/** The provider is unknown or has no credentials configured. */
export class OAuthProviderUnavailableError extends Error {
  constructor() {
    super("OAuth provider unavailable");
    this.name = "OAuthProviderUnavailableError";
  }
}

/** The provider does not vouch for the e-mail, so the account cannot be matched or opened. */
export class ProviderEmailNotVerifiedError extends Error {
  constructor() {
    super("Provider e-mail not verified");
    this.name = "ProviderEmailNotVerifiedError";
  }
}
