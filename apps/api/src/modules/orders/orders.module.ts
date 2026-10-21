import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { UsersModule } from "../users/users.module.js";
import { CreateOrder } from "./application/create-order.js";
import { GetOrder } from "./application/get-order.js";
import { OrderExpiry } from "./application/order-expiry.js";
import { INVENTORY } from "./application/ports/inventory.js";
import { ORDER_REPOSITORY } from "./application/ports/order-repository.js";
import { OrdersController } from "./http/orders.controller.js";
import { PrismaInventory } from "./infra/prisma-inventory.js";
import { PrismaOrderRepository } from "./infra/prisma-order-repository.js";

/** The buyer's orders: the reservation of tickets (V1). */
@Module({
  imports: [AuditModule, UsersModule],
  controllers: [OrdersController],
  providers: [
    CreateOrder,
    GetOrder,
    OrderExpiry,
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    { provide: INVENTORY, useClass: PrismaInventory },
  ],
})
export class OrdersModule {}
