import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin, UserRound } from "lucide-react";
import type { CatalogEventDetail } from "@vira/shared";
import { Alert, Badge, Icon } from "@vira/ui";

import { EventDescription } from "@/components/catalog/event-description";
import { EventImage } from "@/components/catalog/event-image";
import { TicketList } from "@/components/catalog/ticket-list";
import { getEvent, hasEnded } from "@/lib/catalog/api";
import { eventJsonLd, eventMetadata } from "@/lib/catalog/seo";
import { formatDateRange, formatShortDate, formatTimeZone } from "@/lib/format";

interface EventPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const event = await getEvent((await params).slug);
  return event ? eventMetadata(event) : {};
}

/**
 * The event page (docs/DESIGN.md, 4.2), read in a fixed order: photo, name, date and
 * place, description, tickets. A canceled event still answers, so a saved link keeps
 * working, but says so first.
 */
export default async function EventPage({ params }: EventPageProps) {
  const event = await getEvent((await params).slug);
  if (!event) notFound();

  const ended = hasEnded(event);
  const canceled = event.status === "CANCELED";

  return (
    <article className="mx-auto w-full max-w-event pb-24 md:px-6 md:pt-8 lg:px-8 lg:pb-32">
      <script
        type="application/ld+json"
        // Escaped JSON from the API's own fields: no markup can break out of the tag.
        dangerouslySetInnerHTML={{ __html: eventJsonLd(event) }}
      />
      <div className="aspect-banner-sm overflow-hidden md:aspect-banner md:rounded-lg">
        <EventImage
          image={event.image}
          sizes="(min-width: 1120px) 1056px, (min-width: 768px) calc(100vw - 48px), 100vw"
          eager
        />
      </div>

      <div className="px-4 md:px-0">
        <PhotoCredit event={event} />

        <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <p className="text-overline text-accent uppercase">
              <time dateTime={event.startsAt}>
                {formatShortDate(event.startsAt, event.timezone, true)}
              </time>
            </p>
            <h1 className="mt-2 text-h1-sm text-balance md:text-h1">{event.title}</h1>

            <StatusNotices event={event} ended={ended} />

            <EventFacts event={event} />

            <section aria-labelledby="sobre" className="mt-12">
              <h2 id="sobre" className="text-h2-sm md:text-h2">
                Sobre o evento
              </h2>
              <EventDescription html={event.descriptionHtml} />
            </section>
          </div>

          <aside aria-labelledby="ingressos" className="lg:col-span-5">
            <div className="lg:sticky lg:top-24 lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-6">
              <h2 id="ingressos" className="text-h2-sm md:text-h2">
                Ingressos
              </h2>
              <TicketList event={event} closed={canceled || ended} />
            </div>
          </aside>
        </div>
      </div>
    </article>
  );
}

function PhotoCredit({ event }: { event: CatalogEventDetail }) {
  const { credit } = event.image;
  if (!credit && !event.isDemo) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      {credit ? (
        <p className="text-body-sm text-ink-muted">
          Foto:{" "}
          <a
            href={credit.url}
            rel="noopener noreferrer"
            className="underline decoration-1 underline-offset-4 hover:text-ink"
          >
            {credit.author}
          </a>{" "}
          · {credit.license}
        </p>
      ) : (
        <span />
      )}
      {event.isDemo ? <Badge>Demonstração</Badge> : null}
    </div>
  );
}

function StatusNotices({ event, ended }: { event: CatalogEventDetail; ended: boolean }) {
  return (
    <div className="mt-6 flex flex-col gap-3 empty:hidden">
      {event.status === "CANCELED" ? (
        <Alert variant="danger" title="Evento cancelado">
          O organizador cancelou este evento. Os ingressos não estão mais à venda.
        </Alert>
      ) : ended ? (
        <Alert title="Este evento já aconteceu">
          A página continua no ar para quem guardou o endereço.
        </Alert>
      ) : null}
      {event.isDemo ? (
        <Alert title="Evento de demonstração">
          Este é um evento de demonstração. A compra usa o modo de teste do Stripe e nenhuma
          cobrança é feita.
        </Alert>
      ) : null}
    </div>
  );
}

function EventFacts({ event }: { event: CatalogEventDetail }) {
  const { venue } = event;
  const place = `${venue.name}, ${venue.address}, ${venue.city} - ${venue.state}`;
  const map = `https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`;

  return (
    <ul role="list" className="mt-8 flex flex-col gap-5 text-body">
      <li className="flex gap-3">
        <Icon icon={CalendarDays} className="mt-0.5 shrink-0 text-ink-muted" />
        <div>
          <p className="first-letter:uppercase">
            {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
          </p>
          <p className="text-body-sm text-ink-muted">
            {formatTimeZone(event.startsAt, event.timezone)}
          </p>
        </div>
      </li>
      <li className="flex gap-3">
        <Icon icon={MapPin} className="mt-0.5 shrink-0 text-ink-muted" />
        <div>
          <p>{venue.name}</p>
          <p className="text-body-sm text-ink-muted">
            {venue.address} · {venue.city} - {venue.state} ·{" "}
            <a
              href={map}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-ink underline decoration-1 underline-offset-4 hover:text-accent-ink"
            >
              Ver no mapa
              <Icon icon={ExternalLink} size={16} />
              <span className="sr-only">(OpenStreetMap)</span>
            </a>
          </p>
        </div>
      </li>
      <li className="flex gap-3">
        <Icon icon={UserRound} className="mt-0.5 shrink-0 text-ink-muted" />
        <p>Organizado por {event.organizer.name}</p>
      </li>
    </ul>
  );
}
