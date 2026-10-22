// The buyer's orders and tickets in the stand-in API (POST /api/v1/orders…, GET /tickets),
// kept in memory. Bodies are checked with the real contracts of @vira/shared; the rules
// follow docs/API.md ("Pedidos"): one pending order per event, 10 minutes of reservation,
// one extension in the last two, holders before paying. Payment is Stripe's test mode in
// the real API; here the "webhook" is the test route POST /__test/orders/pay.
import { randomUUID } from "node:crypto";
import {
  createOrderRequestSchema,
  idempotencyKeySchema,
  setOrderHoldersRequestSchema,
  type OrderBody,
  type TicketBody,
} from "@vira/shared";

import { catalogEventById, catalogEventBySlug } from "./catalog.ts";

type Body = Record<string, unknown>;

function ownTickets(buyerId: string): TicketBody[] {
  const own = new Set(
    [...orders.values()].filter((o) => o.buyerId === buyerId).map((o) => o.order.id),
  );
  return tickets.filter((ticket) => own.has(ticket.orderId));
}

/** Issues the tickets of a paid order, as the webhook does in the API (V5). */
function issueTickets(stored: StoredOrder, status: TicketBody["status"] = "VALID"): void {
  const { order } = stored;
  const event = catalogEventById(order.event.id);
  for (const item of order.items) {
    for (let index = 0; index < item.quantity; index += 1) {
      const id = randomUUID();
      tickets.push({
        id,
        code: code("VIRA"),
        status,
        holderName: item.holderNames[index] ?? stored.buyerName,
        ticketType: { name: item.name },
        event: {
          ...order.event,
          venueName: event?.venue.name ?? null,
          venueCity: event?.venue.city ?? null,
          venueState: event?.venue.state ?? null,
        },
        orderId: order.id,
        issuedAt: order.paidAt ?? new Date().toISOString(),
        usedAt: status === "USED" ? new Date().toISOString() : null,
        qrToken: `v1.fake.${Buffer.from(id).toString("base64url")}.${Buffer.from(order.id).toString("base64url")}`,
      });
    }
  }
}

export interface OrdersContext {
  /** The signed-in buyer (valid session, CSRF checked on writes), or undefined once answered. */
  buyer: (options: { csrf: boolean }) => { id: string; name: string } | undefined;
  idempotencyKey: string | undefined;
  query: URLSearchParams;
  send: (status: number, body?: unknown) => void;
  problem: (status: number, code: string, extra?: Body) => void;
}

interface StoredOrder {
  buyerId: string;
  buyerName: string;
  key: string;
  order: OrderBody;
  extended: boolean;
}

const MINUTE = 60_000;
const orders = new Map<string, StoredOrder>();
const tickets: TicketBody[] = [];

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const code = (prefix: string) => {
  const part = () =>
    Array.from({ length: 4 }, () => CROCKFORD[Math.floor(Math.random() * 32)]).join("");
  return `${prefix}-${part()}-${part()}`;
};

/** Expires a pending order whose time is up, as the API's job and sweep do. */
function current(stored: StoredOrder): OrderBody {
  const { order } = stored;
  if (order.status === "PENDING" && Date.parse(order.expiresAt) <= Date.now()) {
    order.status = "EXPIRED";
    order.extensionAvailable = false;
  }
  if (order.status === "PENDING") {
    order.extensionAvailable =
      !stored.extended && Date.parse(order.expiresAt) - Date.now() <= 2 * MINUTE;
  }
  return order;
}

const validation = (path: string, message: string) => ({ errors: [{ path, message }] });

/** Answers an orders or tickets route; returns false for any other path. */
export function handleOrders(
  method: string,
  path: string,
  body: Body,
  context: OrdersContext,
): boolean {
  if (method === "POST" && path === "/orders") {
    const buyer = context.buyer({ csrf: true });
    if (!buyer) return true;
    const key = idempotencyKeySchema.safeParse(context.idempotencyKey);
    if (!key.success) {
      context.problem(400, "validation-failed", validation("Idempotency-Key", "envie um UUID"));
      return true;
    }
    const request = createOrderRequestSchema.safeParse(body);
    if (!request.success) {
      context.problem(400, "validation-failed", validation("items", "pedido inválido"));
      return true;
    }
    const replay = [...orders.values()].find((o) => o.buyerId === buyer.id && o.key === key.data);
    if (replay) {
      context.send(200, current(replay));
      return true;
    }
    const event = catalogEventById(request.data.eventId);
    if (!event) {
      context.problem(404, "not-found");
      return true;
    }
    const pending = [...orders.values()].find(
      (o) =>
        o.buyerId === buyer.id && o.order.event.id === event.id && current(o).status === "PENDING",
    );
    if (pending) {
      context.problem(409, "pending-order-exists", {
        detail: "Você já tem uma reserva em andamento para este evento.",
        orderId: pending.order.id,
      });
      return true;
    }
    const items = [];
    for (const item of request.data.items) {
      const type = event.ticketTypes.find((t) => t.id === item.ticketTypeId);
      if (!type) {
        context.problem(404, "not-found");
        return true;
      }
      if (type.salesStatus !== "ON_SALE") {
        context.problem(422, "sales-closed", {
          detail: "As vendas deste ingresso estão fechadas.",
        });
        return true;
      }
      if (item.quantity > type.available) {
        context.problem(409, "insufficient-inventory", {
          detail: `Restam ${String(type.available)} ingresso(s) de "${type.name}".`,
        });
        return true;
      }
      items.push({
        id: randomUUID(),
        ticketTypeId: type.id,
        name: type.name,
        quantity: item.quantity,
        unitPrice: type.price,
        subtotal: { amountCents: type.price.amountCents * item.quantity, currency: "BRL" as const },
        holderNames: [],
      });
    }
    const now = Date.now();
    const order: OrderBody = {
      id: randomUUID(),
      publicCode: code("VIRA-ORD"),
      status: "PENDING",
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
      },
      items,
      total: {
        amountCents: items.reduce((sum, item) => sum + item.subtotal.amountCents, 0),
        currency: "BRL",
      },
      expiresAt: new Date(now + 10 * MINUTE).toISOString(),
      extensionAvailable: false,
      createdAt: new Date(now).toISOString(),
      paidAt: null,
    };
    orders.set(order.id, {
      buyerId: buyer.id,
      buyerName: buyer.name,
      key: key.data,
      order,
      extended: false,
    });
    context.send(201, order);
    return true;
  }

  if (method === "GET" && (path === "/tickets" || path.startsWith("/tickets?"))) {
    const buyer = context.buyer({ csrf: false });
    if (!buyer) return true;
    const query = context.query;
    const past = query.get("when") === "past";
    const limit = Number(query.get("limit") ?? 20);
    const offset = Number(Buffer.from(query.get("cursor") ?? "", "base64url").toString() || 0);
    const now = Date.now();
    const own = ownTickets(buyer.id)
      .filter((ticket) => Date.parse(ticket.event.endsAt) <= now === past)
      .sort((a, b) => {
        const order = Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt);
        return past ? -order : order;
      });
    const page = own.slice(offset, offset + limit);
    context.send(200, {
      data: page.map(({ qrToken: _qrToken, ...summary }) => summary),
      page: {
        limit,
        nextCursor:
          offset + limit < own.length
            ? Buffer.from(String(offset + limit)).toString("base64url")
            : null,
      },
    });
    return true;
  }

  const ticketRoute = /^\/tickets\/([^/?]+)$/.exec(path);
  if (method === "GET" && ticketRoute) {
    const buyer = context.buyer({ csrf: false });
    if (!buyer) return true;
    const ticket = ownTickets(buyer.id).find((t) => t.id === ticketRoute[1]);
    if (ticket) context.send(200, ticket);
    else context.problem(404, "not-found");
    return true;
  }

  const match = /^\/orders\/([^/]+)(?:\/(holders|payment|extend|cancel))?$/.exec(path);
  if (!match) return false;
  const action = match[2] ?? "";
  const write = method !== "GET";
  const buyer = context.buyer({ csrf: write });
  if (!buyer) return true;
  const stored = orders.get(match[1] ?? "");
  if (stored?.buyerId !== buyer.id) {
    context.problem(404, "not-found");
    return true;
  }
  const order = current(stored);
  const notPending = () => {
    context.problem(409, "invalid-state-transition", {
      detail: "Esta reserva não está mais em andamento.",
    });
    return true;
  };

  if (method === "GET" && action === "") {
    context.send(200, order);
    return true;
  }

  if (method === "PUT" && action === "holders") {
    if (order.status !== "PENDING") return notPending();
    const request = setOrderHoldersRequestSchema.safeParse(body);
    if (!request.success) {
      context.problem(400, "validation-failed", validation("holders", "nomes inválidos"));
      return true;
    }
    for (const item of order.items) {
      const line = request.data.holders.find((h) => h.orderItemId === item.id);
      if (line?.names.length !== item.quantity) {
        context.problem(
          400,
          "validation-failed",
          validation("holders", `informe ${String(item.quantity)} nomes`),
        );
        return true;
      }
    }
    for (const item of order.items) {
      item.holderNames = request.data.holders.find((h) => h.orderItemId === item.id)?.names ?? [];
    }
    context.send(200, order);
    return true;
  }

  if (method === "POST" && action === "payment") {
    if (order.status !== "PENDING") return notPending();
    if (order.items.some((item) => item.holderNames.length !== item.quantity)) {
      context.problem(409, "invalid-state-transition", {
        detail: "Informe o nome do titular de cada ingresso antes de pagar.",
      });
      return true;
    }
    context.send(200, {
      clientSecret: `pi_fake${order.id.replaceAll("-", "")}_secret_fake`,
      publishableKey: "pk_test_viraFake",
    });
    return true;
  }

  if (method === "POST" && action === "extend") {
    if (order.status !== "PENDING" || !order.extensionAvailable) return notPending();
    stored.extended = true;
    order.expiresAt = new Date(Date.parse(order.expiresAt) + 10 * MINUTE).toISOString();
    order.extensionAvailable = false;
    context.send(200, order);
    return true;
  }

  if (method === "POST" && action === "cancel") {
    if (order.status !== "PENDING" && order.status !== "CANCELED") return notPending();
    order.status = "CANCELED";
    context.send(200, order);
    return true;
  }

  context.problem(404, "not-found");
  return true;
}

/**
 * Test-only routes (never proxied):
 *   POST /__test/orders/pay?id=          the webhook: marks the order paid, issues tickets
 *   POST /__test/orders/expire-in?id=&seconds=  moves the reservation's deadline
 *   POST /__test/tickets/issue?email=&slug=&holders=Ana,Caio&status=  a paid order with
 *        its tickets (VALID, USED or CANCELED), without going through the checkout
 */
export function handleOrdersTestRoute(
  method: string,
  url: URL,
  send: (status: number, body?: unknown) => void,
  userByEmail: (email: string) => { id: string; name: string } | undefined,
): boolean {
  if (method === "POST" && url.pathname === "/__test/tickets/issue") {
    const buyer = userByEmail(url.searchParams.get("email") ?? "");
    const event = catalogEventBySlug(url.searchParams.get("slug") ?? "");
    const type = event?.ticketTypes[0];
    if (!buyer || !event || !type) {
      send(404, { error: "no buyer or event" });
      return true;
    }
    const holders = (url.searchParams.get("holders") ?? buyer.name).split(",");
    const now = new Date().toISOString();
    const order: OrderBody = {
      id: randomUUID(),
      publicCode: code("VIRA-ORD"),
      status: "PAID",
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timezone: event.timezone,
      },
      items: [
        {
          id: randomUUID(),
          ticketTypeId: type.id,
          name: type.name,
          quantity: holders.length,
          unitPrice: type.price,
          subtotal: { amountCents: type.price.amountCents * holders.length, currency: "BRL" },
          holderNames: holders,
        },
      ],
      total: { amountCents: type.price.amountCents * holders.length, currency: "BRL" },
      expiresAt: now,
      extensionAvailable: false,
      createdAt: now,
      paidAt: now,
    };
    const stored = {
      buyerId: buyer.id,
      buyerName: buyer.name,
      key: randomUUID(),
      order,
      extended: false,
    };
    orders.set(order.id, stored);
    const status = url.searchParams.get("status");
    issueTickets(stored, status === "USED" || status === "CANCELED" ? status : "VALID");
    send(200, {
      orderId: order.id,
      tickets: ownTickets(buyer.id)
        .filter((t) => t.orderId === order.id)
        .map((t) => t.id),
    });
    return true;
  }
  if (method !== "POST" || !url.pathname.startsWith("/__test/orders/")) return false;
  const stored = orders.get(url.searchParams.get("id") ?? "");
  if (!stored) {
    send(404, { error: "no order" });
    return true;
  }
  const { order } = stored;
  if (url.pathname === "/__test/orders/pay") {
    if (current(stored).status !== "PENDING") {
      send(409, { error: order.status });
      return true;
    }
    order.status = "PAID";
    order.paidAt = new Date().toISOString();
    issueTickets(stored);
    send(204);
    return true;
  }
  if (url.pathname === "/__test/orders/expire-in") {
    const seconds = Number(url.searchParams.get("seconds") ?? 0);
    order.expiresAt = new Date(Date.now() + seconds * 1000).toISOString();
    send(204);
    return true;
  }
  send(404, { error: "no route" });
  return true;
}
