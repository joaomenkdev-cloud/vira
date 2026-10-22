import type { OrderBody } from "@vira/shared";

import { extensionAvailable, type Order, subtotalCents } from "../domain/order.js";

const brl = (amountCents: number) => ({ amountCents, currency: "BRL" as const });

/** What the buyer sees of an order: never the copies of their name and e-mail, nor the key. */
export function orderBody(order: Order): OrderBody {
  return {
    id: order.id,
    publicCode: order.publicCode,
    status: order.status,
    event: {
      id: order.event.id,
      slug: order.event.slug,
      title: order.event.title,
      startsAt: order.event.startsAt.toISOString(),
      endsAt: order.event.endsAt.toISOString(),
      timezone: order.event.timezone,
    },
    items: order.items.map((item) => ({
      id: item.id,
      ticketTypeId: item.ticketTypeId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: brl(item.unitPriceCents),
      subtotal: brl(subtotalCents(item)),
      holderNames: [...item.holderNames],
    })),
    total: brl(order.totalCents),
    expiresAt: order.expiresAt.toISOString(),
    extensionAvailable: extensionAvailable(order),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
  };
}
