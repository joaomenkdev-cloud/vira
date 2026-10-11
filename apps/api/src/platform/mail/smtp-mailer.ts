import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";
import { MailDeliveryError, type Mailer, type MailMessage } from "./mailer.js";

const CONNECTION_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 15_000;

interface SmtpErrorLike {
  code?: unknown;
  responseCode?: unknown;
}

/**
 * SMTP adapter over nodemailer. The transport connects on the first message, so
 * processes that never send e-mail do not hold a connection.
 */
@Injectable()
export class SmtpMailer implements Mailer, OnModuleDestroy {
  private transport: Transporter | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: MailMessage): Promise<void> {
    try {
      // nodemailer rejects header values with line breaks, so a subject or an address
      // cannot smuggle in extra headers or recipients.
      await this.getTransport().sendMail({
        from: this.config.mail.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      const { code, responseCode } = (error ?? {}) as SmtpErrorLike;
      throw new MailDeliveryError(
        typeof code === "string" ? code : "UNKNOWN",
        typeof responseCode === "number" ? responseCode : undefined,
      );
    }
  }

  onModuleDestroy(): void {
    this.transport?.close();
    this.transport = undefined;
  }

  private getTransport(): Transporter {
    this.transport ??= createTransport({
      url: this.config.mail.smtpUrl,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: CONNECTION_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
    return this.transport;
  }
}
