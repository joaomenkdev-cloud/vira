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
/** The single extension (+10 min) can be asked for only this close to the end (WCAG 2.2.1). */
export const EXTENSION_WINDOW_MINUTES = 2;
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
    holderNames: z.array(z.string()).meta({
      description: "Um nome por ingresso da linha; vazio até `PUT /orders/{id}/holders`",
    }),
  })
  .meta({ id: "OrderItem" });

/** The name printed on a ticket and checked at the door (docs/PRIVACY.md). */
export const HOLDER_NAME_MAX_LENGTH = 120;
export const holderNameSchema = z
  .string()
  .trim()
  .min(1, "informe o nome do titular")
  .max(HOLDER_NAME_MAX_LENGTH, `use no máximo ${HOLDER_NAME_MAX_LENGTH} caracteres`);

/** One name per ticket of each line of the order, before paying (V6). */
export const setOrderHoldersRequestSchema = z
  .strictObject({
    holders: z
      .array(
        z.strictObject({
          orderItemId: z.uuid(),
          names: z.array(holderNameSchema).min(1).max(MAX_PER_ORDER_LIMIT),
        }),
      )
      .min(1)
      .max(ORDER_ITEMS_MAX),
  })
  .superRefine((request, context) => {
    const seen = new Set<string>();
    request.holders.forEach((line, index) => {
      if (seen.has(line.orderItemId.toLowerCase())) {
        context.addIssue({
          code: "custom",
          message: "linha repetida",
          path: ["holders", index, "orderItemId"],
        });
      }
      seen.add(line.orderItemId.toLowerCase());
    });
  })
  .meta({ id: "SetOrderHoldersRequest" });

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
export type SetOrderHoldersRequest = z.infer<typeof setOrderHoldersRequestSchema>;
export type OrderBody = z.infer<typeof orderSchema>;
export type OrderItemBody = z.infer<typeof orderItemSchema>;

/** What the browser needs to show the Payment Element: never the PaymentIntent's id. */
export const paymentSessionSchema = z
  .strictObject({
    clientSecret: z.string(),
    publishableKey: z.string().startsWith("pk_test_"),
  })
  .meta({ id: "PaymentSession" });

export type PaymentSessionBody = z.infer<typeof paymentSessionSchema>;
