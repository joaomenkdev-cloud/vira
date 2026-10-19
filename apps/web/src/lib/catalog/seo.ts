import type { Metadata } from "next";
import type { CatalogEventDetail } from "@vira/shared";

import { resolveSiteUrl } from "../../config/api-origin";
import { formatDateRange, formatVenue, summarize } from "../format";

/** The stable address of the event photo (see `eventos/[slug]/imagem`). */
export function eventImagePath(slug: string): string {
  return `/eventos/${slug}/imagem`;
}

/** Title, description, canonical address and the link preview of an event page. */
export function eventMetadata(event: CatalogEventDetail): Metadata {
  const when = formatDateRange(event.startsAt, event.endsAt, event.timezone);
  const description = summarize(event.descriptionHtml) || `${when} · ${formatVenue(event.venue)}`;
  const path = `/eventos/${event.slug}`;
  const image = {
    url: eventImagePath(event.slug),
    width: 1200,
    height: Math.round((1200 * event.image.height) / event.image.width),
    alt: event.image.alt,
  };
  return {
    title: event.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      siteName: "Vira",
      url: path,
      title: event.title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: event.title, description },
  };
}

/**
 * schema.org `Event` data for search engines, as a `<script type="application/ld+json">`
 * body. `<` is escaped, so no value can close the tag.
 */
export function eventJsonLd(
  event: CatalogEventDetail,
  siteUrl = resolveSiteUrl(process.env),
): string {
  const url = new URL(`/eventos/${event.slug}`, siteUrl).toString();
  const prices = event.ticketTypes.map((ticketType) => ticketType.price.amountCents);
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    url,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus:
      event.status === "CANCELED"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    description: summarize(event.descriptionHtml, 300),
    image: [new URL(eventImagePath(event.slug), siteUrl).toString()],
    location: {
      "@type": "Place",
      name: event.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venue.address,
        addressLocality: event.venue.city,
        addressRegion: event.venue.state,
        addressCountry: "BR",
      },
    },
    ...(prices.length > 0
      ? {
          offers: {
            "@type": "AggregateOffer",
            url,
            priceCurrency: "BRL",
            lowPrice: (Math.min(...prices) / 100).toFixed(2),
            highPrice: (Math.max(...prices) / 100).toFixed(2),
            availability: event.soldOut
              ? "https://schema.org/SoldOut"
              : "https://schema.org/InStock",
          },
        }
      : {}),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
