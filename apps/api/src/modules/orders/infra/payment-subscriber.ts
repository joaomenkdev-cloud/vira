import { Injectable, type OnModuleInit } from "@nestjs/common";

import { PaymentEvents } from "../../payments/application/public-api.js";
import { SettlePayment } from "../application/settle-payment.js";

/** Applies the payments Stripe confirms to their orders (the webhook of the payments module). */
@Injectable()
export class PaymentSubscriber implements OnModuleInit {
  constructor(
    private readonly events: PaymentEvents,
    private readonly settle: SettlePayment,
  ) {}

  onModuleInit(): void {
    this.events.onPaymentSucceeded((payment, tx) => this.settle.execute(payment, tx));
  }
}
