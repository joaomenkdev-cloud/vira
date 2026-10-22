import type {
  CreateOrderRequest,
  OrderBody,
  PaymentSessionBody,
  SetOrderHoldersRequest,
  TicketListBody,
} from "@vira/shared";

import { api } from "./browser";

/*
 * The buyer's orders (docs/API.md, "Pedidos"). Each one answers 404 for an order of
 * someone else, exactly as for one that does not exist.
 */

const orderPath = (id: string) => `/orders/${encodeURIComponent(id)}`;

/**
 * Reserves the tickets for 10 minutes. `idempotencyKey` is one UUID per purchase
 * attempt: a retry of the same attempt (a lost answer, a double click) gets the same order.
 */
export function createOrder(body: CreateOrderRequest, idempotencyKey: string): Promise<OrderBody> {
  return api.request("/orders", {
    method: "POST",
    body,
    csrf: true,
    headers: { "idempotency-key": idempotencyKey },
  });
}

export function getOrder(id: string): Promise<OrderBody> {
  return api.request(orderPath(id));
}

export function setHolders(id: string, body: SetOrderHoldersRequest): Promise<OrderBody> {
  return api.request(`${orderPath(id)}/holders`, { method: "PUT", body, csrf: true });
}

/** The PaymentIntent of the order: calling again answers the same one. */
export function startPayment(id: string): Promise<PaymentSessionBody> {
  return api.request(`${orderPath(id)}/payment`, { method: "POST", csrf: true });
}

export function extendOrder(id: string): Promise<OrderBody> {
  return api.request(`${orderPath(id)}/extend`, { method: "POST", csrf: true });
}

export function cancelOrder(id: string): Promise<OrderBody> {
  return api.request(`${orderPath(id)}/cancel`, { method: "POST", csrf: true });
}

/** The buyer's upcoming tickets, newest page first. */
export function listUpcomingTickets(): Promise<TicketListBody> {
  return api.request("/tickets?when=upcoming&limit=50");
}
