import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { UsersModule } from "../users/users.module.js";
import { CancelOrder } from "./application/cancel-order.js";
import { CreateOrder } from "./application/create-order.js";
import { ExpireOrder } from "./application/expire-order.js";
import { ExtendOrder } from "./application/extend-order.js";
import { GetOrder } from "./application/get-order.js";
import { OrderExpiry } from "./application/order-expiry.js";
import { SettlePayment } from "./application/settle-payment.js";
import { StartPayment } from "./application/start-payment.js";
import { EXPIRATION_SCHEDULER } from "./application/ports/expiration-scheduler.js";
import { INVENTORY } from "./application/ports/inventory.js";
import { ORDER_REPOSITORY } from "./application/ports/order-repository.js";
import { SweepExpiredOrders } from "./application/sweep-expired-orders.js";
import { OrdersController } from "./http/orders.controller.js";
import { BullMqExpirationScheduler } from "./infra/bullmq-expiration-scheduler.js";
import { OrderSweeper } from "./infra/order-sweeper.js";
import { PaymentSubscriber } from "./infra/payment-subscriber.js";
import { OrdersJobHandlers } from "./infra/orders-job-handlers.js";
import { PrismaInventory } from "./infra/prisma-inventory.js";
import { PrismaOrderRepository } from "./infra/prisma-order-repository.js";

const persistence = [
  OrderExpiry,
  { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
  { provide: INVENTORY, useClass: PrismaInventory },
];

/**
 * The buyer's orders: the reservation of tickets (V1), its extension and cancellation (V2)
 * the start of its payment (V3) and the payments Stripe confirms (V4).
 */
@Module({
  imports: [AuditModule, UsersModule, PaymentsModule, OutboxModule],
  controllers: [OrdersController],
  providers: [
    CreateOrder,
    StartPayment,
    SettlePayment,
    PaymentSubscriber,
    GetOrder,
    ExtendOrder,
    CancelOrder,
    ...persistence,
    { provide: EXPIRATION_SCHEDULER, useClass: BullMqExpirationScheduler },
  ],
})
export class OrdersModule {}

/**
 * Background work of orders: the delayed expirations and the sweep that backs them up.
 * Imported by the worker (and embedded mode).
 */
@Module({
  imports: [AuditModule],
  providers: [ExpireOrder, SweepExpiredOrders, OrdersJobHandlers, OrderSweeper, ...persistence],
})
export class OrdersJobsModule {}
