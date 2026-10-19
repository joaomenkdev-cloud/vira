import { describe, expect, it } from "vitest";

import type { CatalogEvent, CatalogEventDetail } from "../domain/catalog-event.js";
import { CatalogEventNotFoundError } from "./errors.js";
import { GetFeaturedEvents } from "./get-featured-events.js";
import { GetPublicEvent } from "./get-public-event.js";
import { ListCatalogEvents } from "./list-catalog-events.js";
import type { CatalogListQuery, CatalogRepository } from "./ports/catalog-repository.js";

const now = new Date("2026-11-01T12:00:00Z");
const clock = { now: () => now };

function event(id: string, startsAt: string): CatalogEventDetail {
  return {
    id,
    slug: `evento-${id}`,
    title: `Evento ${id}`,
    status: "PUBLISHED",
    startsAt: new Date(startsAt),
    endsAt: new Date(Date.parse(startsAt) + 3 * 60 * 60 * 1000),
    timezone: "America/Sao_Paulo",
    venue: { name: "Circo Voador", address: "Rua dos Arcos", city: "Rio de Janeiro", state: "RJ" },
    image: {
      key: `events/${id}/capa.webp`,
      alt: "Pista cheia",
      width: 2400,
      height: 1350,
      blurDataUrl: "data:image/webp;base64,AA==",
      credit: null,
    },
    isDemo: false,
    ticketTypes: [],
    descriptionHtml: "",
    organizerName: "Coletivo",
  };
}

/** Records what it was asked and answers from a fixed, already ordered list. */
class FakeCatalog implements CatalogRepository {
  readonly asked: CatalogListQuery[] = [];
  readonly featuredAsked: [Date, number][] = [];
  constructor(private readonly events: CatalogEventDetail[]) {}

  list(query: CatalogListQuery): Promise<CatalogEvent[]> {
    this.asked.push(query);
    const { after } = query;
    const rest = after
      ? this.events.slice(this.events.findIndex((e) => e.id === after.id) + 1)
      : this.events;
    return Promise.resolve(rest.slice(0, query.limit + 1));
  }

  featured(at: Date, limit: number): Promise<CatalogEvent[]> {
    this.featuredAsked.push([at, limit]);
    return Promise.resolve(this.events.slice(0, limit));
  }

  findBySlug(slug: string): Promise<CatalogEventDetail | null> {
    return Promise.resolve(this.events.find((e) => e.slug === slug) ?? null);
  }
}

const events = [
  event("a", "2026-11-10T22:00:00Z"),
  event("b", "2026-11-10T22:00:00Z"),
  event("c", "2026-11-20T22:00:00Z"),
];

describe("storefront list", () => {
  it("pages through the events, pointing at the last one shown", async () => {
    const catalog = new FakeCatalog(events);
    const list = new ListCatalogEvents(catalog, clock);

    const first = await list.execute({ city: "Recife" }, { limit: 2 });
    expect(first.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(first.next).toEqual({ startsAt: events[1]?.startsAt, id: "b" });
    expect(catalog.asked[0]).toMatchObject({ city: "Recife", limit: 2, now });

    const second = await list.execute(
      { city: "Recife" },
      { limit: 2, ...(first.next ? { after: first.next } : {}) },
    );
    expect(second.events.map((e) => e.id)).toEqual(["c"]);
    expect(second.next).toBeNull();
  });

  it("has no next page when the last one is exactly full", async () => {
    const page = await new ListCatalogEvents(new FakeCatalog(events), clock).execute(
      {},
      { limit: 3 },
    );
    expect(page.events).toHaveLength(3);
    expect(page.next).toBeNull();
  });
});

describe("featured events", () => {
  it("asks for six, as of now", async () => {
    const catalog = new FakeCatalog(events);
    await new GetFeaturedEvents(catalog, clock).execute();
    expect(catalog.featuredAsked).toEqual([[now, 6]]);
  });
});

describe("event page", () => {
  it("finds the event by its slug", async () => {
    const found = await new GetPublicEvent(new FakeCatalog(events)).execute("evento-c");
    expect(found.id).toBe("c");
  });

  it("says not found for an unknown slug", async () => {
    await expect(new GetPublicEvent(new FakeCatalog(events)).execute("nada")).rejects.toThrow(
      CatalogEventNotFoundError,
    );
  });
});
