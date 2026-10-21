import { Injectable, type OnModuleInit } from "@nestjs/common";
import { z } from "zod";

import { JobHandlerRegistry } from "../../../platform/queue/job-handlers.js";
import { SendTicketsEmail } from "../application/send-tickets-email.js";

const payloadSchema = z.strictObject({ orderId: z.uuid() });

/** Connects `tickets.issued` of the `email` queue to the e-mail with the tickets. */
@Injectable()
export class TicketsJobHandlers implements OnModuleInit {
  constructor(
    private readonly registry: JobHandlerRegistry,
    private readonly sendTickets: SendTicketsEmail,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      queue: "email",
      type: "tickets.issued",
      handle: (data) =>
        this.sendTickets.execute(payloadSchema.parse(data.payload, { reportInput: false }).orderId),
    });
  }
}
