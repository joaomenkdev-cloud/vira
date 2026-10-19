import type { CatalogEventDetail, PublicTicketType } from "@vira/shared";
import { Alert, Badge, cn, EmptyState } from "@vira/ui";

import { formatDayAndTime, formatPrice } from "@/lib/format";

/** Below this many tickets left, a type on sale says "Últimos ingressos". */
export const FEW_LEFT = 10;

/**
 * The ticket types of the event page (docs/DESIGN.md, 3.11): rows, not cards, each with
 * its name, price and where its sales stand, in words. Choosing and buying arrive with
 * the checkout (V6); until then the list informs and says the purchase is not open.
 */
export function TicketList({ event, closed }: { event: CatalogEventDetail; closed: boolean }) {
  if (closed) {
    return (
      <p className="mt-4 text-body text-ink-muted">
        {event.status === "CANCELED"
          ? "As vendas foram encerradas com o cancelamento."
          : "As vendas deste evento foram encerradas."}
      </p>
    );
  }
  if (!event.ticketTypes.some((ticketType) => ticketType.salesStatus === "ON_SALE")) {
    return (
      <>
        {event.ticketTypes.length > 0 ? <Rows event={event} /> : null}
        <EmptyState title="Ingressos indisponíveis" className="py-8">
          As vendas deste evento não estão abertas no momento.
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <Rows event={event} />
      <Alert title="A compra pelo site ainda não está aberta" className="mt-6">
        Por enquanto, esta página mostra os tipos de ingresso e os preços.
      </Alert>
    </>
  );
}

function Rows({ event }: { event: CatalogEventDetail }) {
  return (
    <ul role="list" className="mt-4 divide-y divide-line border-y border-line">
      {event.ticketTypes.map((ticketType) => (
        <TicketRow key={ticketType.id} ticketType={ticketType} timeZone={event.timezone} />
      ))}
    </ul>
  );
}

function TicketRow({ ticketType, timeZone }: { ticketType: PublicTicketType; timeZone: string }) {
  const unavailable = ticketType.salesStatus !== "ON_SALE";
  return (
    <li className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className={cn("text-body font-semibold", unavailable ? "text-ink-muted" : "text-ink")}>
          {ticketType.name}
        </p>
        {ticketType.description ? (
          <p className="mt-1 text-body-sm text-ink-muted">{ticketType.description}</p>
        ) : null}
        <SalesStatus ticketType={ticketType} timeZone={timeZone} />
      </div>
      <p
        className={cn(
          "shrink-0 text-price tabular-nums",
          unavailable ? "text-ink-muted" : "text-ink",
        )}
      >
        {formatPrice(ticketType.price)}
      </p>
    </li>
  );
}

function SalesStatus({ ticketType, timeZone }: { ticketType: PublicTicketType; timeZone: string }) {
  switch (ticketType.salesStatus) {
    case "ON_SALE":
      return ticketType.available <= FEW_LEFT ? (
        <Badge variant="accent" className="mt-2">
          Últimos ingressos
        </Badge>
      ) : null;
    case "SOLD_OUT":
      return (
        <Badge variant="neutral" className="mt-2">
          Esgotado
        </Badge>
      );
    case "NOT_STARTED":
      return (
        <p className="mt-2 text-body-sm text-ink-muted">
          {ticketType.salesStartAt
            ? `Vendas a partir de ${formatDayAndTime(ticketType.salesStartAt, timeZone)}`
            : "Vendas ainda não abertas"}
        </p>
      );
    case "CLOSED":
      return <p className="mt-2 text-body-sm text-ink-muted">Vendas encerradas</p>;
  }
}
