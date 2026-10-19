import type { CatalogEventDetail } from "@vira/shared";
import { describe, expect, it } from "vitest";

import { eventJsonLd, eventMetadata } from "./seo";

const event: CatalogEventDetail = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "forro-na-praca",
  title: "Forró na Praça",
  status: "PUBLISHED",
  startsAt: "2026-03-15T00:00:00.000Z",
  endsAt: "2026-03-15T05:00:00.000Z",
  timezone: "America/Sao_Paulo",
  isDemo: true,
  priceFrom: { amountCents: 8000, currency: "BRL" },
  soldOut: false,
  descriptionHtml: "<p>Forró pé de serra.</p>",
  venue: { name: "Casa de Shows", address: "Rua da Aurora, 100", city: "Recife", state: "PE" },
  image: {
    url: "https://storage.example/vira/events/x.webp?X-Amz-Signature=abc",
    alt: "Palco iluminado",
    width: 2400,
    height: 1600,
    blurDataUrl: "data:image/webp;base64,AAAA",
    credit: null,
  },
  organizer: { name: "Organização" },
  ticketTypes: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Pista",
      description: null,
      price: { amountCents: 8000, currency: "BRL" },
      maxPerOrder: 6,
      available: 10,
      salesStartAt: null,
      salesEndAt: null,
      salesStatus: "ON_SALE",
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      name: "Camarote",
      description: null,
      price: { amountCents: 20000, currency: "BRL" },
      maxPerOrder: 6,
      available: 0,
      salesStartAt: null,
      salesEndAt: null,
      salesStatus: "SOLD_OUT",
    },
  ],
};

describe("eventMetadata", () => {
  it("describes the page from the description, with a photo address that does not expire", () => {
    const metadata = eventMetadata(event);
    expect(metadata.title).toBe("Forró na Praça");
    expect(metadata.description).toBe("Forró pé de serra.");
    expect(metadata.alternates?.canonical).toBe("/eventos/forro-na-praca");
    expect(metadata.openGraph?.images).toEqual([
      { url: "/eventos/forro-na-praca/imagem", width: 1200, height: 800, alt: "Palco iluminado" },
    ]);
    // The signed address never leaks into a cached preview.
    expect(JSON.stringify(metadata)).not.toContain("X-Amz-Signature");
  });

  it("falls back to when and where without a description", () => {
    expect(eventMetadata({ ...event, descriptionHtml: "" }).description).toBe(
      "sábado, 14 de março · 21:00 – 02:00 · Casa de Shows · Recife",
    );
  });
});

describe("eventJsonLd", () => {
  const parse = (value: string) => JSON.parse(value) as Record<string, unknown>;

  it("is a schema.org Event with the place and the price range", () => {
    expect(parse(eventJsonLd(event, "https://vira.example"))).toMatchObject({
      "@type": "Event",
      url: "https://vira.example/eventos/forro-na-praca",
      eventStatus: "https://schema.org/EventScheduled",
      image: ["https://vira.example/eventos/forro-na-praca/imagem"],
      location: { name: "Casa de Shows", address: { addressCountry: "BR" } },
      offers: {
        lowPrice: "80.00",
        highPrice: "200.00",
        availability: "https://schema.org/InStock",
      },
    });
  });

  it("marks a canceled event, and leaves offers out without ticket types", () => {
    const data = parse(
      eventJsonLd({ ...event, status: "CANCELED", ticketTypes: [] }, "https://vira.example"),
    );
    expect(data["eventStatus"]).toBe("https://schema.org/EventCancelled");
    expect(data).not.toHaveProperty("offers");
  });

  it("cannot close its script tag", () => {
    const json = eventJsonLd({ ...event, title: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(parse(json)["name"]).toBe("</script><script>alert(1)</script>");
  });
});
