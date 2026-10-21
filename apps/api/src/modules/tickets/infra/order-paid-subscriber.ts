import { Injectable, type OnModuleInit } from "@nestjs/common";

import { OrderEvents } from "../../orders/application/public-api.js";
import { IssueTickets } from "../application/issue-tickets.js";

/** Issues the tickets of each order that becomes PAID, in the same transaction. */
@Injectable()
export class OrderPaidSubscriber implements OnModuleInit {
  constructor(
    private readonly events: OrderEvents,
    private readonly issue: IssueTickets,
  ) {}

  onModuleInit(): void {
    this.events.onOrderPaid((order, tx) => this.issue.execute(order, tx));
  }
}
