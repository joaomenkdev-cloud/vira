import type { CatalogEventDetail, TicketBody } from "@vira/shared";
import { Alert, Badge } from "@vira/ui";

import { EventImage } from "@/components/catalog/event-image";
import { formatDayAndTime, formatShortDate, formatTime } from "@/lib/format";

import { TicketQr } from "./ticket-qr";

/**
 * The digital ticket (docs/DESIGN.md, 3.10): the event above the perforation, the QR
 * below it. Every piece of it is also text, so the QR is never the only way to read it.
 * A used ticket keeps its code readable under a faded QR; a canceled one hides the QR.
 */
export function TicketStub({
  ticket,
  event,
}: {
  ticket: TicketBody;
  /** The event's public page, for the photo, the address and "Demonstração". */
  event: CatalogEventDetail | null;
}) {
  const { timezone } = ticket.event;
  const place = [
    ticket.event.venueName,
    event?.venue.address,
    [ticket.event.venueCity, ticket.event.venueState].filter(Boolean).join(" - "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      aria-label={`Ingresso ${ticket.code}`}
      className="overflow-hidden rounded-lg border border-line bg-surface print:border-ink"
    >
      {event ? (
        <div className="hidden aspect-ticket overflow-hidden md:block print:hidden">
          <EventImage image={event.image} sizes="480px" />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 p-6">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-overline text-accent uppercase">
            <time dateTime={ticket.event.startsAt}>
              {formatShortDate(ticket.event.startsAt, timezone, true).split(" · ")[0]}
            </time>
            {event?.isDemo ? <Badge>Demonstração</Badge> : null}
          </p>
          <h2 className="mt-1 text-h2-sm text-balance md:text-h2">{ticket.event.title}</h2>
          <p className="mt-1 text-body">
            {formatTime(ticket.event.startsAt, timezone)} –{" "}
            {formatTime(ticket.event.endsAt, timezone)}
          </p>
          {place ? <p className="mt-1 text-body-sm text-ink-muted">{place}</p> : null}
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-overline text-ink-muted uppercase">Titular</dt>
            <dd className="mt-1 text-body font-semibold">{ticket.holderName}</dd>
          </div>
          <div>
            <dt className="text-overline text-ink-muted uppercase">Tipo</dt>
            <dd className="mt-1 text-body font-semibold">{ticket.ticketType.name}</dd>
          </div>
        </dl>
      </div>

      <Perforation />

      <div className="flex flex-col items-center gap-3 p-6">
        {ticket.status === "CANCELED" ? (
          <Alert variant="danger" title="Ingresso cancelado" className="w-full">
            Este ingresso não dá mais acesso ao evento.
          </Alert>
        ) : (
          <div className="relative">
            <TicketQr
              token={ticket.qrToken}
              code={ticket.code}
              className={ticket.status === "USED" ? "size-60 opacity-25" : "size-60"}
            />
            {ticket.status === "USED" && ticket.usedAt ? (
              <Badge
                variant="neutral"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
              >
                Utilizado em {formatDayAndTime(ticket.usedAt, timezone)}
              </Badge>
            ) : null}
          </div>
        )}
        <p className="font-mono text-body-sm tracking-widest tabular-nums">{ticket.code}</p>
        {ticket.status === "VALID" ? (
          <p className="text-body-sm text-ink-muted">Apresente este QR na entrada</p>
        ) : null}
      </div>
    </article>
  );
}

/**
 * The dashed line with a semicircle cut on each side: circles in the page colour, half
 * hidden by the ticket's own `overflow-hidden`.
 */
function Perforation() {
  return (
    <div aria-hidden="true" className="relative border-t-2 border-dashed border-line">
      <span className="absolute -top-3 -left-3 size-6 rounded-full border border-line bg-bg print:hidden" />
      <span className="absolute -top-3 -right-3 size-6 rounded-full border border-line bg-bg print:hidden" />
    </div>
  );
}
