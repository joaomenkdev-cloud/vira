import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CatalogEventSummary } from "@vira/shared";
import { EmptyState, Icon } from "@vira/ui";

import { CatalogEventCard, EventGrid } from "@/components/catalog/catalog-event-card";
import { EventImage } from "@/components/catalog/event-image";
import { HomeSearch } from "@/components/catalog/home-search";
import { WeekendChip } from "@/components/catalog/weekend-chip";
import { getFeaturedEvents } from "@/lib/catalog/api";
import { formatShortDate } from "@/lib/format";

/**
 * Home (docs/DESIGN.md, 4.1): the promise, the search and the featured events, the
 * soonest one also shown large beside the title on a desktop. Without published events
 * the page says so plainly; nothing is invented to fill it (ADR-0010).
 */
export default async function HomePage() {
  const { data: featured } = await getFeaturedEvents();
  const [spotlight] = featured;

  return (
    <div className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8">
      <section className="grid gap-12 pt-12 pb-12 md:pt-16 md:pb-16 lg:grid-cols-12 lg:items-center lg:gap-8 lg:pt-24 lg:pb-24">
        <div className={spotlight ? "lg:col-span-7" : "lg:col-span-12"}>
          <h1 className="max-w-3xl text-display-sm text-balance md:text-display">
            Encontre seu próximo evento.
          </h1>
          <p className="mt-6 max-w-reading text-body-lg text-pretty text-ink-muted">
            Descubra eventos, compre seu ingresso e entre com o QR Code.
          </p>
          <div className="mt-10 max-w-xl">
            <HomeSearch />
            {featured.length > 0 ? (
              <div className="mt-4 flex gap-2">
                <WeekendChip href="/eventos?periodo=fim-de-semana" />
              </div>
            ) : null}
          </div>
        </div>
        {spotlight ? <Spotlight event={spotlight} /> : null}
      </section>

      <section aria-labelledby="destaques" className="pb-24 md:pb-32">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="destaques" className="text-h2-sm md:text-h2">
            Em destaque
          </h2>
          {featured.length > 0 ? (
            <Link
              href="/eventos"
              className="inline-flex min-h-11 items-center gap-1 rounded-sm text-label text-ink underline decoration-1 underline-offset-4 hover:text-accent-ink"
            >
              Ver todos
              <Icon icon={ArrowRight} size={16} />
            </Link>
          ) : null}
        </div>
        {featured.length > 0 ? (
          <div className="mt-8">
            <EventGrid>
              {featured.map((event, index) => (
                // The spotlight already shows the first event on a desktop.
                <li key={event.id} className={index === 0 ? "flex lg:hidden" : "flex"}>
                  <CatalogEventCard event={event} className="w-full" />
                </li>
              ))}
            </EventGrid>
          </div>
        ) : (
          <EmptyState title="Nenhum evento por aqui ainda">
            Quando organizadores publicarem eventos, eles aparecem nesta página.
          </EmptyState>
        )}
      </section>
    </div>
  );
}

/**
 * The soonest featured event, large, beside the title (desktop only: on a phone it is the
 * first card, so the search stays above the fold).
 */
function Spotlight({ event }: { event: CatalogEventSummary }) {
  return (
    <Link
      href={`/eventos/${event.slug}`}
      className="group hidden overflow-hidden rounded-lg border border-line bg-surface transition-colors duration-slow hover:border-line-strong lg:col-span-5 lg:block"
    >
      <div className="aspect-hero overflow-hidden">
        <div className="size-full transition-transform duration-slow group-hover:scale-103 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <EventImage image={event.image} sizes="(min-width: 1024px) 480px, 0px" eager />
        </div>
      </div>
      <div className="p-5">
        <p className="text-overline text-accent uppercase">
          <time dateTime={event.startsAt}>{formatShortDate(event.startsAt, event.timezone)}</time>
        </p>
        <p className="mt-2 line-clamp-2 text-h3 text-balance text-ink">{event.title}</p>
      </div>
    </Link>
  );
}
