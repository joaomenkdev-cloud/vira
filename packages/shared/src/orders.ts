import { z } from "zod";

import { MAX_PER_ORDER_LIMIT, moneySchema } from "./events.js";

/**
 * Contracts of orders (V1, docs/API.md#pedidos-orders). The buyer only says what and how
 * many: prices and totals are always read from the database, and any extra field is
 * refused (OWASP API3, mass assignment).
 */

export const ORDER_STATUSES = ["PENDING", "PAID", "EXPIRED", "CANCELED", "REFUNDED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** How long a reservation holds the tickets (ADR-0007). */
export const RESERVATION_MINUTES = 10;
/** An event has at most 20 ticket types, so an order never needs more lines. */
export const ORDER_ITEMS_MAX = 20;
/** Stripe's ceiling for one BRL payment (R$ 999.999,99); an order never asks for more. */
export const ORDER_TOTAL_MAX_CENTS = 99_999_999;

/** `Idempotency-Key`: a UUID the client makes for each purchase attempt (docs/API.md#idempotência). */
export const idempotencyKeySchema = z.uuid().meta({
  description: "UUID gerado pelo cliente por tentativa de compra",
  example: "0192a0e4-1111-7000-8000-000000000001",
});

export const createOrderRequestSchema = z
  .strictObject({
    eventId: z.uuid(),
    items: z
      .array(
        z.strictObject({
          ticketTypeId: z.uuid(),
          quantity: z.number().int().min(1).max(MAX_PER_ORDER_LIMIT),
        }),
      )
      .min(1)
      .max(ORDER_ITEMS_MAX),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>();
    request.items.forEach((item, index) => {
      if (seen.has(item.ticketTypeId)) {
        context.addIssue({
          code: "custom",
          message: "tipo de ingresso repetido; some as quantidades num item só",
          path: ["items", index, "ticketTypeId"],
        });
      }
      seen.add(item.ticketTypeId);
    });
  })
  .meta({ id: "CreateOrderRequest" });

export const orderItemSchema = z
  .strictObject({
    id: z.uuid(),
    ticketTypeId: z.uuid(),
    name: z.string(),
    quantity: z.number().int(),
    unitPrice: moneySchema.meta({ description: "Preço no momento da reserva" }),
    subtotal: moneySchema,
  })
  .meta({ id: "OrderItem" });

export const orderEventSchema = z
  .strictObject({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    timezone: z.string(),
  })
  .meta({ id: "OrderEvent" });

export const orderSchema = z
  .strictObject({
    id: z.uuid(),
    publicCode: z.string().meta({ example: "VIRA-ORD-3F8A-K2QX" }),
    status: z.enum(ORDER_STATUSES),
    event: orderEventSchema,
    items: z.array(orderItemSchema),
    total: moneySchema,
    expiresAt: z.string().meta({ description: "Até quando a reserva segura os ingressos" }),
    extensionAvailable: z.boolean().meta({
      description: "A reserva ainda pode ser estendida uma vez (+10 min, nos 2 minutos finais)",
    }),
    createdAt: z.string(),
    paidAt: z.string().nullable(),
  })
  .meta({ id: "Order" });

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type OrderBody = z.infer<typeof orderSchema>;
export type OrderItemBody = z.infer<typeof orderItemSchema>;
