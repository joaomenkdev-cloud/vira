import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import type { Order } from "../domain/order.js";
import type { Caller } from "./buyer.js";
import { InvalidOrderError, OrderNotFoundError, OrderStateError } from "./errors.js";
import {
  type LineHolders,
  ORDER_REPOSITORY,
  type OrderRepository,
} from "./ports/order-repository.js";

/**
 * Names the holder of each ticket of a pending order (V6), before paying: every line of
 * the order, once, with one name per ticket. Saying it again replaces the names.
 */
@Injectable()
export class SetHolders {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * @throws OrderNotFoundError when there is no such order or it is someone else's.
   * @throws OrderStateError when it is not pending, or its reservation is over.
   * @throws InvalidOrderError when a line is missing, unknown or has the wrong number of names.
   */
  async execute(caller: Caller, orderId: string, holders: readonly LineHolders[]): Promise<Order> {
    const order = await this.orders.findOwned(orderId, caller.id);
    if (!order) throw new OrderNotFoundError();
    const now = this.clock.now();
    if (order.status !== "PENDING" || now >= order.expiresAt) {
      throw new OrderStateError("Esta reserva não está mais em andamento.");
    }

    const byItem = new Map(
      holders.map((line, index) => [line.orderItemId.toLowerCase(), { ...line, index }]),
    );
    holders.forEach((line, index) => {
      if (!order.items.some((item) => item.id === line.orderItemId.toLowerCase())) {
        throw new InvalidOrderError(`holders.${index}.orderItemId`, "não é uma linha deste pedido");
      }
    });
    const lines = order.items.map((item) => {
      const line = byItem.get(item.id);
      if (!line) {
        throw new InvalidOrderError("holders", `faltam os titulares de ${item.name}`);
      }
      if (line.names.length !== item.quantity) {
        throw new InvalidOrderError(
          `holders.${line.index}.names`,
          `informe ${item.quantity === 1 ? "1 nome" : `${item.quantity} nomes`} para ${item.name}`,
        );
      }
      return { orderItemId: item.id, names: line.names };
    });

    if (!(await this.orders.setHolders(order.id, caller.id, lines, now))) {
      throw new OrderStateError("Esta reserva não está mais em andamento.");
    }
    const updated = await this.orders.findOwned(order.id, caller.id);
    if (!updated) throw new OrderNotFoundError();
    return updated;
  }
}
