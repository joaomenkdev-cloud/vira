import { ChevronDown } from "lucide-react";
import type { OrderBody } from "@vira/shared";
import { Icon } from "@vira/ui";

import { formatDayAndTime, formatPrice } from "@/lib/format";

export function ticketCount(quantity: number): string {
  return quantity === 1 ? "1 ingresso" : `${String(quantity)} ingressos`;
}

export function orderQuantity(order: OrderBody): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * What is being bought, for how much and for which event, always in view (docs/DESIGN.md,
 * 4.3): a sticky column on a desktop, a summary that opens at the top on a phone. Every
 * value comes from the order the API answered, never from the page.
 */
export function OrderSummary({ order }: { order: OrderBody }) {
  const quantity = orderQuantity(order);
  return (
    <>
      <details className="group rounded-lg border border-line bg-surface lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block truncate text-body font-semibold">{order.event.title}</span>
            <span className="block text-body-sm text-ink-muted">
              {ticketCount(quantity)} · {formatPrice(order.total)}
            </span>
          </span>
          <Icon
            icon={ChevronDown}
            className="shrink-0 transition-transform duration-fast group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-line px-4 pb-4">
          <SummaryBody order={order} />
        </div>
      </details>

      <section
        aria-labelledby="resumo"
        className="hidden rounded-lg border border-line bg-surface p-6 lg:sticky lg:top-24 lg:block"
      >
        <h2 id="resumo" className="text-h3">
          {order.event.title}
        </h2>
        <SummaryBody order={order} />
      </section>
    </>
  );
}

function SummaryBody({ order }: { order: OrderBody }) {
  return (
    <>
      <p className="mt-2 text-body-sm text-ink-muted">
        <time dateTime={order.event.startsAt}>
          {formatDayAndTime(order.event.startsAt, order.event.timezone)}
        </time>
      </p>
      <ul role="list" className="mt-4 divide-y divide-line border-y border-line">
        {order.items.map((item) => (
          <li key={item.id} className="py-3">
            <p className="text-body font-semibold">{item.name}</p>
            <p className="mt-1 flex justify-between gap-4 text-body-sm text-ink-muted tabular-nums">
              <span>
                {item.quantity} × {formatPrice(item.unitPrice)}
              </span>
              <span className="text-ink">{formatPrice(item.subtotal)}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-baseline justify-between gap-4">
        <span className="text-body">Total</span>
        <span className="text-price tabular-nums">{formatPrice(order.total)}</span>
      </p>
      <p className="mt-2 text-body-sm text-ink-muted">Valores calculados pelo servidor.</p>
    </>
  );
}
