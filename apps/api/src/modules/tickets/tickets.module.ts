import { Module } from "@nestjs/common";

import { OrdersModule } from "../orders/orders.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { GetTicket } from "./application/get-ticket.js";
import { IssueTickets } from "./application/issue-tickets.js";
import { ListTickets } from "./application/list-tickets.js";
import { TICKET_REPOSITORY } from "./application/ports/ticket-repository.js";
import { QrTokens } from "./application/qr-tokens.js";
import { SendTicketsEmail } from "./application/send-tickets-email.js";
import { TicketsController } from "./http/tickets.controller.js";
import { OrderPaidSubscriber } from "./infra/order-paid-subscriber.js";
import { PrismaTicketRepository } from "./infra/prisma-ticket-repository.js";
import { TicketsJobHandlers } from "./infra/tickets-job-handlers.js";

const persistence = [{ provide: TICKET_REPOSITORY, useClass: PrismaTicketRepository }];

/**
 * Tickets (V5, ADR-0008): issued in the transaction that pays their order, listed and shown
 * to their owner with the signed QR token.
 */
@Module({
  imports: [OrdersModule, OutboxModule],
  controllers: [TicketsController],
  providers: [IssueTickets, OrderPaidSubscriber, ListTickets, GetTicket, QrTokens, ...persistence],
})
export class TicketsModule {}

/** Background work of tickets: the e-mail that delivers them. Imported by the worker. */
@Module({
  providers: [SendTicketsEmail, TicketsJobHandlers, ...persistence],
})
export class TicketsJobsModule {}
