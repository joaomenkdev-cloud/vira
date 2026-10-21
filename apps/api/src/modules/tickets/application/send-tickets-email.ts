import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { MAILER, type Mailer } from "../../../platform/mail/mailer.js";
import { ticketsEmail } from "./emails.js";
import { TICKET_REPOSITORY, type TicketRepository } from "./ports/ticket-repository.js";

/**
 * Runs in the worker when the outbox hands over `tickets.issued`. A retry may send the
 * e-mail twice, which is harmless; an order without tickets sends nothing.
 */
@Injectable()
export class SendTicketsEmail {
  constructor(
    @Inject(TICKET_REPOSITORY) private readonly tickets: TicketRepository,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(orderId: string): Promise<void> {
    const order = await this.tickets.findIssuedOrder(orderId);
    if (!order) return;
    await this.mailer.send(ticketsEmail(order, this.config.http.webOrigin));
  }
}
