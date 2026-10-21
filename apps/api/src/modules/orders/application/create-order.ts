import { Inject, Injectable } from "@nestjs/common";
import { type CreateOrderRequest, ORDER_TOTAL_MAX_CENTS } from "@vira/shared";

import {
  TRANSACTION_RUNNER,
  type TransactionContext,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  RATE_LIMITER,
  type RateLimiter,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { AccountContacts } from "../../users/application/public-api.js";
import { newPublicCode, type Order, requestHash, totalCents } from "../domain/order.js";
import {
  eventSalesRefusal,
  reservationExpiry,
  type SaleTicketType,
  ticketTypeSalesRefusal,
} from "../domain/reservation-policy.js";
import { auditContext, type Caller, type RequestContext } from "./buyer.js";
import {
  BuyerNotFoundError,
  EventNotFoundError,
  IdempotencyKeyReusedError,
  InsufficientInventoryError,
  InvalidOrderError,
  OrderNotFoundError,
  PendingOrderExistsError,
  RequestInProgressError,
  SalesClosedError,
  TicketTypeNotFoundError,
} from "./errors.js";
import { byTicketTypeId, OrderExpiry } from "./order-expiry.js";
import { EXPIRATION_SCHEDULER, type ExpirationScheduler } from "./ports/expiration-scheduler.js";
import { INVENTORY, type Inventory } from "./ports/inventory.js";
import {
  type NewOrderItem,
  ORDER_REPOSITORY,
  type OrderRepository,
} from "./ports/order-repository.js";
import { ORDERS_RATE_LIMITS } from "./rate-limits.js";

/** Tries for a free public code; with 40 random bits, a second try is already rare. */
const PUBLIC_CODE_ATTEMPTS = 3;

interface OrderLine {
  readonly ticketType: SaleTicketType;
  readonly ticketTypeId: string;
  readonly quantity: number;
}

export interface CreatedOrder {
  readonly order: Order;
  /** The same request was made before: this is the order it created. */
  readonly replayed: boolean;
}

/**
 * Reserves the tickets of a purchase for 10 minutes (V1, ADR-0007). Everything happens in
 * one transaction: the stock of each ticket type is held by a conditional `UPDATE` (in
 * id order, so two orders never deadlock), and any refusal rolls back what was held
 * before it. The `Idempotency-Key` makes a retried request find the order it made instead
 * of making another (ADR-0006). Once committed, the order's expiration is scheduled (V2).
 */
@Injectable()
export class CreateOrder {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(INVENTORY) private readonly inventory: Inventory,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly expiry: OrderExpiry,
    private readonly contacts: AccountContacts,
    private readonly audit: AuditLog,
    @Inject(EXPIRATION_SCHEDULER) private readonly scheduler: ExpirationScheduler,
  ) {}

  /**
   * @throws RateLimitExceededError past the account's budget of orders.
   * @throws RequestInProgressError while a request with the same key is being processed.
   * @throws IdempotencyKeyReusedError when the key was used for another request.
   * @throws EventNotFoundError when there is no such event on sale.
   * @throws TicketTypeNotFoundError when a ticket type is not one of the event's.
   * @throws SalesClosedError when the event or a ticket type is not on sale now.
   * @throws InvalidOrderError above `max_per_order` or the ceiling of one payment.
   * @throws PendingOrderExistsError when the buyer already has a pending order for it.
   * @throws InsufficientInventoryError when fewer tickets are left than asked for.
   */
  async execute(
    caller: Caller,
    idempotencyKey: string,
    request: CreateOrderRequest,
    context: RequestContext = {},
  ): Promise<CreatedOrder> {
    const budget = await this.limiter.hit(ORDERS_RATE_LIMITS.createAccount, caller.id);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const buyer = await this.contacts.contactOf(caller.id);
    if (!buyer) throw new BuyerNotFoundError();
    const hash = requestHash(request);
    const now = this.clock.now();

    const outcome = await this.transactions.run(async (tx) => {
      if (!(await this.orders.lockIdempotencyKey(caller.id, idempotencyKey, tx))) {
        throw new RequestInProgressError();
      }
      const previous = await this.orders.findByIdempotencyKey(caller.id, idempotencyKey, tx);
      if (previous) {
        if (!Buffer.from(previous.requestHash).equals(hash)) throw new IdempotencyKeyReusedError();
        return { orderId: previous.id, replayed: true } as const;
      }

      const event = await this.inventory.findEventForSale(request.eventId, tx);
      if (!event) throw new EventNotFoundError();
      const closed = eventSalesRefusal(event, now);
      if (closed) throw new SalesClosedError(closed);

      const lines = request.items.map((item, index) => {
        const ticketType = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
        if (!ticketType) throw new TicketTypeNotFoundError();
        const refusal = ticketTypeSalesRefusal(event, ticketType, now);
        if (refusal) throw new SalesClosedError(refusal);
        if (item.quantity > ticketType.maxPerOrder) {
          throw new InvalidOrderError(
            `items.${index}.quantity`,
            `No máximo ${ticketType.maxPerOrder} ingresso(s) de "${ticketType.name}" por pedido.`,
          );
        }
        return { ticketType, ticketTypeId: ticketType.id, quantity: item.quantity };
      });
      const expectedTotal = totalCents(
        lines.map((line) => ({
          quantity: line.quantity,
          unitPriceCents: line.ticketType.priceCents,
        })),
      );
      if (expectedTotal > ORDER_TOTAL_MAX_CENTS) {
        throw new InvalidOrderError(
          "items",
          "O total passa do máximo de R$ 999.999,99 por pedido.",
        );
      }

      // One pending order per buyer and event; one whose time is up gives way, even if its
      // job has not run yet.
      const pending = await this.orders.findPending(caller.id, event.id, tx);
      if (pending && !(await this.expiry.expireIfOverdue(pending.id, now, tx))) {
        throw new PendingOrderExistsError(pending.id);
      }

      const items = await this.reserve(lines, tx);
      const orderId = this.ids.next();
      const order = {
        id: orderId,
        buyerId: caller.id,
        eventId: event.id,
        totalCents: totalCents(items),
        expiresAt: reservationExpiry(now),
        idempotencyKey,
        requestHash: hash,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        createdAt: now,
        items,
      };
      for (let attempt = 0; attempt < PUBLIC_CODE_ATTEMPTS; attempt++) {
        const inserted = await this.orders.insert({ ...order, publicCode: newPublicCode() }, tx);
        if (inserted === "created") {
          const ticketCount = items.reduce((sum, item) => sum + item.quantity, 0);
          return {
            orderId,
            replayed: false,
            totalCents: order.totalCents,
            ticketCount,
            expiresAt: order.expiresAt,
            expiredOrderId: pending?.id ?? null,
          } as const;
        }
        // A concurrent request of the same buyer won the event's single pending slot.
        if (inserted === "pending-exists") throw new PendingOrderExistsError(null);
      }
      throw new Error("No free order code");
    });

    if (!outcome.replayed) {
      if (outcome.expiredOrderId) {
        await this.audit.record(
          { action: "order.expired", entityId: outcome.expiredOrderId, metadata: {} },
          { actor: "system" },
        );
      }
      await this.scheduler.schedule(outcome.orderId, outcome.expiresAt);
      await this.audit.record(
        {
          action: "order.created",
          entityId: outcome.orderId,
          metadata: {
            eventId: request.eventId,
            totalCents: outcome.totalCents,
            ticketCount: outcome.ticketCount,
          },
        },
        auditContext(caller, context),
      );
    }
    const order = await this.orders.findOwned(outcome.orderId, caller.id);
    if (!order) throw new OrderNotFoundError();
    return { order, replayed: outcome.replayed };
  }

  /** Holds every line, in ticket type id order; the first one short throws (and rolls back). */
  private async reserve(
    lines: readonly OrderLine[],
    tx: TransactionContext,
  ): Promise<NewOrderItem[]> {
    const items: NewOrderItem[] = [];
    for (const line of [...lines].sort(byTicketTypeId)) {
      const held = await this.inventory.reserve(line.ticketTypeId, line.quantity, tx);
      if (!held.reserved)
        throw new InsufficientInventoryError(line.ticketType.name, held.available);
      items.push({
        id: this.ids.next(),
        ticketTypeId: line.ticketTypeId,
        quantity: line.quantity,
        unitPriceCents: held.unitPriceCents,
      });
    }
    return items;
  }
}
