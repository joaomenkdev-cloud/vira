/** No such event on sale (a draft looks the same as one that does not exist). */
export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

/** The ticket type is not one of the event's. */
export class TicketTypeNotFoundError extends Error {
  constructor() {
    super("Ticket type not found");
    this.name = "TicketTypeNotFoundError";
  }
}

/** No such order, or it is someone else's (the two look the same). */
export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}

/** The account behind the session is gone. */
export class BuyerNotFoundError extends Error {
  constructor() {
    super("Buyer not found");
    this.name = "BuyerNotFoundError";
  }
}

/** The event or one of the ticket types is not on sale right now. */
export class SalesClosedError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "SalesClosedError";
  }
}

/** Fewer tickets are left than the order asks for. */
export class InsufficientInventoryError extends Error {
  constructor(
    readonly ticketTypeName: string,
    readonly available: number,
  ) {
    super(`Insufficient inventory: ${available} left`);
    this.name = "InsufficientInventoryError";
  }
}

/** The buyer already has a pending order for this event (one at a time). */
export class PendingOrderExistsError extends Error {
  constructor(readonly orderId: string | null) {
    super("Pending order exists");
    this.name = "PendingOrderExistsError";
  }
}

/** Another request with the same `Idempotency-Key` is still being processed. */
export class RequestInProgressError extends Error {
  constructor() {
    super("Request in progress");
    this.name = "RequestInProgressError";
  }
}

/** The `Idempotency-Key` was already used for another purchase. */
export class IdempotencyKeyReusedError extends Error {
  constructor() {
    super("Idempotency key reused");
    this.name = "IdempotencyKeyReusedError";
  }
}

/** A combination the request schema cannot see on its own (above `max_per_order`). */
export class InvalidOrderError extends Error {
  constructor(
    readonly path: string,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "InvalidOrderError";
  }
}

/** The order is not in a state that allows it (already ended, extended, too early...). */
export class OrderStateError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "OrderStateError";
  }
}
