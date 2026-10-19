import {
  catalogEventDetailSchema,
  catalogEventListSchema,
  type CatalogEventSummary,
  featuredEventsSchema,
  problemDetailsSchema,
} from "@vira/shared";
import request from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri } from "../../src/platform/errors/problem-types.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const NOW = new Date("2026-11-01T12:00:00Z");
const clock = { now: () => NOW };
const HOUR = 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

interface TicketSpec {
  priceCents?: number;
  capacity?: number;
  sold?: number;
  reserved?: number;
  salesStartAt?: Date;
  salesEndAt?: Date;
}

interface EventSpec {
  title?: string;
  startsAt?: Date;
  endsAt?: Date;
  city?: string;
  status?: "DRAFT" | "PUBLISHED" | "CANCELED";
  isDemo?: boolean;
  ticketTypes?: TicketSpec[];
}

describe.skipIf(!dockerAvailable)("storefront (PostgreSQL)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  let organizerId: string;
  const api = () => request(testApp.app.getHttpServer());

  /** Writes an event straight to the tables, as publication (events.int.test.ts) leaves it. */
  async function insertEvent(spec: EventSpec = {}) {
    const id = uuidv7();
    const status = spec.status ?? "PUBLISHED";
    const startsAt = spec.startsAt ?? at("2026-12-05T22:00:00Z");
    await prisma.event.create({
      data: {
        id,
        organizerId,
        slug: `evento-${id.slice(-12)}`,
        title: spec.title ?? "Noite de forró no Circo",
        descriptionMd: "**Traga** documento.",
        descriptionHtml: "<p><strong>Traga</strong> documento.</p>",
        status,
        startsAt,
        endsAt: spec.endsAt ?? new Date(startsAt.getTime() + 5 * HOUR),
        timezone: "America/Sao_Paulo",
        venueName: "Circo Voador",
        venueAddress: "Rua dos Arcos, s/n",
        venueCity: spec.city ?? "Rio de Janeiro",
        venueState: "RJ",
        imageKey: `events/${id}/${uuidv7()}.webp`,
        imageAlt: "Pista cheia sob a lona",
        imageWidth: 2400,
        imageHeight: 1350,
        imageBlurDataUrl: "data:image/webp;base64,AA==",
        ...(spec.isDemo
          ? {
              isDemo: true,
              imageCreditAuthor: "Fulana Fotógrafa",
              imageCreditUrl: "https://unsplash.com/photos/abc",
              imageLicense: "Unsplash License",
            }
          : {}),
        publishedAt: status === "DRAFT" ? null : at("2026-10-01T00:00:00Z"),
        canceledAt: status === "CANCELED" ? at("2026-10-20T00:00:00Z") : null,
        cancelReason: status === "CANCELED" ? "Chuva forte prevista para a data." : null,
        createdAt: at("2026-09-01T00:00:00Z"),
        ticketTypes: {
          create: (spec.ticketTypes ?? [{}]).map((ticket, index) => ({
            id: uuidv7(),
            name: `Lote ${index + 1}`,
            priceCents: ticket.priceCents ?? 8000,
            capacity: ticket.capacity ?? 100,
            sold: ticket.sold ?? 0,
            reserved: ticket.reserved ?? 0,
            salesStartAt: ticket.salesStartAt ?? null,
            salesEndAt: ticket.salesEndAt ?? null,
            sortOrder: index,
            createdAt: at("2026-09-01T00:00:00Z"),
          })),
        },
      },
    });
    return { id, slug: `evento-${id.slice(-12)}` };
  }

  async function list(
    query = "",
  ): Promise<{ ids: string[]; body: CatalogEventSummary[]; next: string | null }> {
    const response = await api().get(`/api/v1/events${query}`).expect(200);
    const page = catalogEventListSchema.parse(response.body);
    return { ids: page.data.map((e) => e.id), body: page.data, next: page.page.nextCursor };
  }

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: { DATABASE_URL: infrastructure.databaseUrl, REDIS_URL: infrastructure.redisUrl },
      override: (builder) => builder.overrideProvider(CLOCK).useValue(clock),
    });
    prisma = testApp.app.get(PrismaService);
    const userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: `o-${userId}@exemplo.com`,
        name: "Organizadora",
        role: "ORGANIZER",
        emailVerifiedAt: NOW,
        createdAt: NOW,
      },
    });
    organizerId = uuidv7();
    await prisma.organizerProfile.create({
      data: {
        id: organizerId,
        userId,
        displayName: "Coletivo Lona",
        slug: "coletivo-lona",
        createdAt: NOW,
      },
    });
  });

  beforeEach(async () => {
    await prisma.event.deleteMany();
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("lists only published events that have not ended, soonest first, without organizer data", async () => {
    const later = await insertEvent({ startsAt: at("2026-12-20T22:00:00Z") });
    const sooner = await insertEvent({ startsAt: at("2026-11-10T22:00:00Z") });
    // Started yesterday, ends tomorrow: still on the list.
    const ongoing = await insertEvent({
      startsAt: at("2026-10-31T12:00:00Z"),
      endsAt: at("2026-11-02T12:00:00Z"),
    });
    await insertEvent({ status: "DRAFT" });
    await insertEvent({ status: "CANCELED" });
    await insertEvent({ startsAt: at("2026-10-30T22:00:00Z"), endsAt: at("2026-10-31T03:00:00Z") });

    const { ids, body } = await list();
    expect(ids).toEqual([ongoing.id, sooner.id, later.id]);

    const [first] = body;
    expect(first?.venue).toEqual({ name: "Circo Voador", city: "Rio de Janeiro", state: "RJ" });
    expect(first?.image.url).toContain("X-Amz-Signature=");
    expect(first?.priceFrom).toEqual({ amountCents: 8000, currency: "BRL" });
    // The schema is strict, so these would already fail it; say it plainly anyway.
    const text = JSON.stringify(body);
    for (const field of [
      "descriptionMd",
      "cancelReason",
      "sold",
      "reserved",
      "organizerId",
      "imageKey",
      "address",
    ]) {
      expect(text).not.toContain(`"${field}"`);
    }
  });

  it("pages through events that start at the same time without skipping or repeating any", async () => {
    const sameTime = at("2026-11-15T23:00:00Z");
    for (let i = 0; i < 7; i++) await insertEvent({ startsAt: sameTime });
    for (let i = 0; i < 3; i++)
      await insertEvent({ startsAt: new Date(sameTime.getTime() + (i - 1) * HOUR) });
    const all = (await list("?limit=50")).ids;
    expect(all).toHaveLength(10);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await list(`?limit=3${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...page.ids);
      cursor = page.next;
      pages++;
      // An event published mid-way, earlier than where the reader is, does not shift the pages.
      if (pages === 2) await insertEvent({ startsAt: new Date(sameTime.getTime() - 2 * HOUR) });
    } while (cursor);

    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
    expect(pages).toBe(4);
  });

  it("searches the title, filters by city and date, and keeps the cursor to its search", async () => {
    const forro = await insertEvent({
      title: "Noite de Forró",
      city: "Recife",
      startsAt: at("2026-11-20T22:00:00Z"),
    });
    const samba = await insertEvent({
      title: "Roda de samba 100% autoral",
      startsAt: at("2026-11-21T22:00:00Z"),
    });
    const december = await insertEvent({
      title: "Forró de dezembro",
      city: "recife",
      startsAt: at("2026-12-12T22:00:00Z"),
    });

    expect((await list("?q=NOITE")).ids).toEqual([forro.id]);
    expect((await list("?q=forr")).ids).toEqual([forro.id, december.id]);
    // `%` and `_` are plain characters in a search, not wildcards.
    expect((await list("?q=0%25%20a")).ids).toEqual([samba.id]);
    expect((await list("?q=%25%25")).ids).toEqual([]);
    expect((await list("?q=__")).ids).toEqual([]);
    expect((await list("?city=RECIFE")).ids).toEqual([forro.id, december.id]);
    expect((await list("?city=%25")).ids).toEqual([]);
    expect((await list("?city=R_cife")).ids).toEqual([]);
    expect((await list("?from=2026-12-01T00:00:00-03:00")).ids).toEqual([december.id]);
    expect((await list("?to=2026-11-21T22:00:00Z")).ids).toEqual([forro.id]);

    const firstPage = await list("?city=recife&limit=1");
    expect(firstPage.next).not.toBeNull();
    await api().get(`/api/v1/events?limit=1&cursor=${firstPage.next}`).expect(400);
    // Same search typed in another case: same results, so the cursor still fits.
    expect((await list(`?city=Recife&limit=1&cursor=${firstPage.next}`)).ids).toEqual([
      december.id,
    ]);
  });

  it("says when an event is sold out and prices it from the cheapest ticket left", async () => {
    await insertEvent({
      startsAt: at("2026-11-10T22:00:00Z"),
      ticketTypes: [{ priceCents: 5000, sold: 100 }, { priceCents: 9000 }, { priceCents: 12000 }],
    });
    await insertEvent({
      startsAt: at("2026-11-11T22:00:00Z"),
      ticketTypes: [{ sold: 90, reserved: 10 }],
    });

    const { body } = await list();
    expect(body.map((e) => [e.priceFrom?.amountCents ?? null, e.soldOut])).toEqual([
      [9000, false],
      [null, true],
    ]);
  });

  it("features up to six upcoming events that can be bought now, soonest first", async () => {
    const upcoming = [];
    for (let day = 10; day < 18; day++) {
      upcoming.push(await insertEvent({ startsAt: at(`2026-11-${day}T22:00:00Z`) }));
    }
    // None of these is on sale right now.
    await insertEvent({ startsAt: at("2026-11-02T22:00:00Z"), ticketTypes: [{ sold: 100 }] });
    await insertEvent({
      startsAt: at("2026-11-02T22:00:00Z"),
      ticketTypes: [{ salesStartAt: at("2026-11-02T00:00:00Z") }],
    });
    await insertEvent({
      startsAt: at("2026-11-02T22:00:00Z"),
      ticketTypes: [{ salesEndAt: at("2026-11-01T00:00:00Z") }],
    });
    await insertEvent({ startsAt: at("2026-10-31T22:00:00Z"), endsAt: at("2026-11-02T03:00:00Z") });
    await insertEvent({ startsAt: at("2026-11-02T22:00:00Z"), status: "DRAFT" });
    await insertEvent({ startsAt: at("2026-11-02T22:00:00Z"), status: "CANCELED" });

    const response = await api().get("/api/v1/events/featured").expect(200);
    const { data } = featuredEventsSchema.parse(response.body);
    expect(data.map((e) => e.id)).toEqual(upcoming.slice(0, 6).map((e) => e.id));
  });

  it("shows the event page with what is left of each ticket type", async () => {
    const event = await insertEvent({
      isDemo: true,
      ticketTypes: [
        { priceCents: 6000, sold: 70, reserved: 30 },
        { priceCents: 8000, sold: 12, reserved: 3 },
        { priceCents: 10000, salesStartAt: at("2026-11-15T00:00:00Z") },
      ],
    });

    const response = await api().get(`/api/v1/events/${event.slug}`).expect(200);
    const detail = catalogEventDetailSchema.parse(response.body);
    expect(detail).toMatchObject({
      id: event.id,
      status: "PUBLISHED",
      isDemo: true,
      descriptionHtml: "<p><strong>Traga</strong> documento.</p>",
      venue: {
        name: "Circo Voador",
        address: "Rua dos Arcos, s/n",
        city: "Rio de Janeiro",
        state: "RJ",
      },
      organizer: { name: "Coletivo Lona" },
      priceFrom: { amountCents: 8000, currency: "BRL" },
      soldOut: false,
    });
    expect(detail.image.credit).toEqual({
      author: "Fulana Fotógrafa",
      url: "https://unsplash.com/photos/abc",
      license: "Unsplash License",
    });
    expect(detail.ticketTypes.map((t) => [t.available, t.salesStatus])).toEqual([
      [0, "SOLD_OUT"],
      [85, "ON_SALE"],
      [100, "NOT_STARTED"],
    ]);
  });

  it("keeps the page of a canceled event, with nothing on sale and without the reason", async () => {
    const event = await insertEvent({ status: "CANCELED" });
    const response = await api().get(`/api/v1/events/${event.slug}`).expect(200);
    const detail = catalogEventDetailSchema.parse(response.body);
    expect(detail.status).toBe("CANCELED");
    expect(detail.ticketTypes.map((t) => t.salesStatus)).toEqual(["CLOSED"]);
    expect(JSON.stringify(response.body)).not.toContain("Chuva");
  });

  it("answers 404 for a draft and for a slug that does not exist", async () => {
    const draft = await insertEvent({ status: "DRAFT" });
    for (const slug of [draft.slug, "evento-que-nao-existe"]) {
      const response = await api().get(`/api/v1/events/${slug}`).expect(404);
      expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri("not-found"));
    }
  });
});
