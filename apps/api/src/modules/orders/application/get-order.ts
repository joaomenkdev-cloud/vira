import { Inject, Injectable } from "@nestjs/common";

import type { Order } from "../domain/order.js";
import type { Caller } from "./buyer.js";
import { OrderNotFoundError } from "./errors.js";
import { ORDER_REPOSITORY, type OrderRepository } from "./ports/order-repository.js";

/** One of the caller's own orders. */
@Injectable()
export class GetOrder {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  /** @throws OrderNotFoundError when there is no such order or it is someone else's. */
  async execute(caller: Caller, orderId: string): Promise<Order> {
    const order = await this.orders.findOwned(orderId, caller.id);
    if (!order) throw new OrderNotFoundError();
    return order;
  }
}
