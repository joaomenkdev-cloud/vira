/** A plain-text transactional e-mail. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Sends transactional e-mail. Modules depend on this port; the SMTP adapter is the
 * only code that knows how a message leaves the system (Mailpit locally, Resend in
 * production).
 */
export interface Mailer {
  /** Resolves once the server accepted the message; rejects with {@link MailDeliveryError}. */
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol("MAILER");

/**
 * Delivery failed. The message carries no recipient, subject or server response:
 * it ends up in job logs, which must stay free of personal data.
 */
export class MailDeliveryError extends Error {
  constructor(
    /** SMTP or network error code, e.g. `ECONNECTION` or `EENVELOPE`. */
    readonly code: string,
    /** SMTP reply code when the server answered, e.g. 550. */
    readonly responseCode?: number,
  ) {
    super(`Mail delivery failed (${code}${responseCode === undefined ? "" : ` ${responseCode}`})`);
    this.name = "MailDeliveryError";
  }
}
