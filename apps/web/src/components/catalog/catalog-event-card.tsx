import Link from "next/link";
import type { ReactNode } from "react";
import type { CatalogEventSummary } from "@vira/shared";
import { EventCard } from "@vira/ui";

import { formatPriceFrom, formatShortDate, formatVenue } from "@/lib/format";

import { EventImage } from "./event-image";

/** 1 column on a phone, 2 from 640 px, 3 from 1024 px, in the 1200 px page. */
export const CARD_IMAGE_SIZES = "(min-width: 1024px) 368px, (min-width: 640px) 50vw, 100vw";

export function CatalogEventCard({
  event,
  className,
}: {
  event: CatalogEventSummary;
  className?: string;
}) {
  return (
    <EventCard
      link={<Link href={`/eventos/${event.slug}`} />}
      title={event.title}
      date={
        <time dateTime={event.startsAt}>{formatShortDate(event.startsAt, event.timezone)}</time>
      }
      venue={formatVenue(event.venue)}
      price={formatPriceFrom(event.priceFrom)}
      status={event.soldOut ? "Esgotado" : null}
      isDemo={event.isDemo}
      image={<EventImage image={event.image} sizes={CARD_IMAGE_SIZES} />}
      {...(className ? { className } : {})}
    />
  );
}

/** The grid of cards (docs/DESIGN.md, 3.3). */
export function EventGrid({ children }: { children: ReactNode }) {
  return (
    <ul role="list" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
      {children}
    </ul>
  );
}
