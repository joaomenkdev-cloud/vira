import {
  organizerEventListSchema,
  organizerEventSchema,
  problemDetailsSchema,
  ticketTypeSchema,
} from "@vira/shared";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri, type ProblemType } from "../../src/platform/errors/problem-types.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { AccessTokens } from "../../src/platform/security/access-token.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

/** A clock the tests move by hand (creation order, events that end). */
const clock = { current: new Date("2026-10-17T12:00:00Z"), now: () => clock.current };
const tick = () => {
  clock.current = new Date(clock.current.getTime() + 1000);
};

const draft = {
  title: "Noite de forró no Circo",
  descriptionMd: "**Traga** documento.",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00Z",
  timezone: "America/Sao_Paulo",
  venue: {
    name: "Circo Voador",
    address: "Rua dos Arcos, s/n",
    city: "Rio de Janeiro",
    state: "RJ",
  },
};
const ticket = { name: "Pista", priceCents: 8000, capacity: 100 };

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

describe.skipIf(!dockerAvailable)("organizer events (PostgreSQL)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  const api = () => request(testApp.app.getHttpServer());

  /** An organizer (account + profile) and the bearer header of a session of theirs. */
  async function organizer(options: { profile?: boolean } = {}) {
    const userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: `o-${userId}@exemplo.com`,
        name: "Organizadora",
        role: "ORGANIZER",
        emailVerifiedAt: clock.current,
        createdAt: clock.current,
      },
    });
    if (options.profile !== false) {
      await prisma.organizerProfile.create({
        data: {
          id: uuidv7(),
          userId,
          displayName: "Coletivo",
          slug: `coletivo-${userId.slice(-12)}`,
          createdAt: clock.current,
        },
      });
    }
    const { token } = testApp.app
      .get(AccessTokens)
      .issue({ sub: userId, role: "ORGANIZER", sid: uuidv7() });
    const auth = `Bearer ${token}`;
    return {
      userId,
      get: (path: string) => api().get(`/api/v1${path}`).set("Authorization", auth),
      post: (path: string, body: object = {}) =>
        api().post(`/api/v1${path}`).set("Authorization", auth).send(body),
      patch: (path: string, body: object) =>
        api().patch(`/api/v1${path}`).set("Authorization", auth).send(body),
      delete: (path: string) => api().delete(`/api/v1${path}`).set("Authorization", auth),
    };
  }
  type Organizer = Awaited<ReturnType<typeof organizer>>;

  async function createDraft(owner: Organizer, body: object = draft) {
    tick();
    const response = await owner.post("/organizer/events", body).expect(201);
    return organizerEventSchema.parse(response.body);
  }

  /** What the image upload does (its own suite: event-images.int.test.ts), by hand. */
  async function attachImage(eventId: string) {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        imageKey: `events/${eventId}/capa.webp`,
        imageAlt: "Pista cheia sob a lona",
        imageWidth: 2400,
        imageHeight: 1350,
        imageBlurDataUrl: "data:image/webp;base64,AA==",
      },
    });
  }

  async function publishedEvent(owner: Organizer) {
    const event = await createDraft(owner);
    const ticketType = ticketTypeSchema.parse(
      (await owner.post(`/organizer/events/${event.id}/ticket-types`, ticket).expect(201)).body,
    );
    await attachImage(event.id);
    await owner.post(`/organizer/events/${event.id}/publish`).expect(200);
    return { event, ticketType };
  }

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: { DATABASE_URL: infrastructure.databaseUrl, REDIS_URL: infrastructure.redisUrl },
      override: (builder) => builder.overrideProvider(CLOCK).useValue(clock),
    });
    prisma = testApp.app.get(PrismaService);
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("takes a draft to publication, saying what is missing on the way, then cancels it", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    expect(event).toMatchObject({
      status: "DRAFT",
      descriptionHtml: "<p><strong>Traga</strong> documento.</p>",
      ticketTypes: [],
      image: null,
    });

    const incomplete = await ana.post(`/organizer/events/${event.id}/publish`).expect(409);
    expectProblem(incomplete, "invalid-state-transition");
    expect(problemDetailsSchema.parse(incomplete.body).errors?.map((e) => e.path)).toEqual([
      "image",
      "ticketTypes",
    ]);

    await ana.post(`/organizer/events/${event.id}/ticket-types`, ticket).expect(201);
    await attachImage(event.id);
    await ana.patch(`/organizer/events/${event.id}`, { title: "Forró de dezembro" }).expect(200);
    const published = organizerEventSchema.parse(
      (await ana.post(`/organizer/events/${event.id}/publish`).expect(200)).body,
    );
    expect(published).toMatchObject({
      status: "PUBLISHED",
      publishedAt: clock.current.toISOString(),
      image: { alt: "Pista cheia sob a lona" },
    });
    expect(published.slug).toMatch(/^forro-de-dezembro-[0-9a-f]{6}$/);
    expectProblem(
      await ana.post(`/organizer/events/${event.id}/publish`).expect(409),
      "invalid-state-transition",
    );
    expectProblem(
      await ana.delete(`/organizer/events/${event.id}`).expect(409),
      "invalid-state-transition",
    );

    const canceled = organizerEventSchema.parse(
      (
        await ana
          .post(`/organizer/events/${event.id}/cancel`, { reason: "Chuva forte prevista" })
          .expect(200)
      ).body,
    );
    expect(canceled).toMatchObject({ status: "CANCELED", cancelReason: "Chuva forte prevista" });
    expectProblem(
      await ana.patch(`/organizer/events/${event.id}`, { title: "De volta" }).expect(409),
      "invalid-state-transition",
    );

    const audit = await prisma.auditLog.findMany({
      where: { entityId: event.id },
      orderBy: { occurredAt: "asc" },
    });
    expect(audit.map((row) => [row.action, row.actorId, row.metadata])).toEqual([
      ["event.published", ana.userId, {}],
      ["event.canceled", ana.userId, {}],
    ]);
  });

  it("answers 404 to every route on another organizer's event, and changes nothing", async () => {
    const ana = await organizer();
    const bia = await organizer();
    const { event, ticketType } = await publishedEvent(ana);
    const draftOfAna = await createDraft(ana);

    const attempts: (() => request.Test)[] = [
      () => bia.get(`/organizer/events/${event.id}`),
      () => bia.patch(`/organizer/events/${event.id}`, { title: "Tomado" }),
      () => bia.delete(`/organizer/events/${draftOfAna.id}`),
      () => bia.post(`/organizer/events/${draftOfAna.id}/publish`),
      () => bia.post(`/organizer/events/${event.id}/cancel`, { reason: "Tomado" }),
      () => bia.post(`/organizer/events/${event.id}/ticket-types`, ticket),
      () => bia.patch(`/organizer/ticket-types/${ticketType.id}`, { capacity: 1 }),
      () => bia.delete(`/organizer/ticket-types/${ticketType.id}`),
    ];
    const unknown = uuidv7();
    for (const attempt of attempts) {
      const response = await attempt().expect(404);
      expectProblem(response, "not-found");
    }
    // Indistinguishable from an id that does not exist at all.
    const missing = await bia.get(`/organizer/events/${unknown}`).expect(404);
    const foreign = await bia.get(`/organizer/events/${event.id}`).expect(404);
    const { requestId: _a, ...missingBody } = missing.body as Record<string, unknown>;
    const { requestId: _b, ...foreignBody } = foreign.body as Record<string, unknown>;
    expect({ ...foreignBody, instance: undefined }).toEqual({
      ...missingBody,
      instance: undefined,
    });

    const list = organizerEventListSchema.parse(
      (await bia.get("/organizer/events").expect(200)).body,
    );
    expect(list.data).toEqual([]);

    const intact = organizerEventSchema.parse(
      (await ana.get(`/organizer/events/${event.id}`).expect(200)).body,
    );
    expect(intact).toMatchObject({ title: draft.title, status: "PUBLISHED" });
    expect(intact.ticketTypes).toEqual([expect.objectContaining({ capacity: 100 })]);
    await ana.get(`/organizer/events/${draftOfAna.id}`).expect(200);
  });

  it("refuses an organizer without a profile with 403", async () => {
    const semPerfil = await organizer({ profile: false });
    const response = await semPerfil.post("/organizer/events", draft).expect(403);
    expectProblem(response, "forbidden");
  });

  it("stores only sanitized HTML, whatever the markdown holds", async () => {
    const ana = await organizer();
    const event = await createDraft(ana, {
      ...draft,
      descriptionMd:
        "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))",
    });
    const row = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(row.descriptionHtml).not.toMatch(/<(script|img)|href="javascript/i);
    expect(row.descriptionHtml).toContain("&lt;script&gt;");
  });

  it("keeps the capacity at or above what is sold and reserved, and ticket types with sales", async () => {
    const ana = await organizer();
    const { event, ticketType } = await publishedEvent(ana);
    await ana
      .post(`/organizer/events/${event.id}/ticket-types`, { ...ticket, name: "Camarote" })
      .expect(201);
    // What orders (V1) will do.
    await prisma.ticketType.update({
      where: { id: ticketType.id },
      data: { sold: 30, reserved: 5 },
    });

    expectProblem(
      await ana.patch(`/organizer/ticket-types/${ticketType.id}`, { capacity: 34 }).expect(409),
      "conflict",
    );
    const resized = ticketTypeSchema.parse(
      (await ana.patch(`/organizer/ticket-types/${ticketType.id}`, { capacity: 35 }).expect(200))
        .body,
    );
    expect(resized).toMatchObject({ capacity: 35, sold: 30, reserved: 5 });
    expectProblem(
      await ana.delete(`/organizer/ticket-types/${ticketType.id}`).expect(409),
      "conflict",
    );
  });

  it("deletes a draft with its ticket types", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    await ana.post(`/organizer/events/${event.id}/ticket-types`, ticket).expect(201);
    await ana.delete(`/organizer/events/${event.id}`).expect(204);
    await ana.get(`/organizer/events/${event.id}`).expect(404);
    expect(await prisma.ticketType.count({ where: { eventId: event.id } })).toBe(0);
  });

  it("pages through the list without repeats or gaps, even as events are added", async () => {
    const ana = await organizer();
    const created: string[] = [];
    for (let i = 0; i < 5; i++)
      created.push((await createDraft(ana, { ...draft, title: `Evento ${i}` })).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : "?limit=2";
      const page = organizerEventListSchema.parse(
        (await ana.get(`/organizer/events${query}`).expect(200)).body,
      );
      seen.push(...page.data.map((e) => e.id));
      cursor = page.page.nextCursor;
      // A new event during the walk is newer than everything listed: it never shifts the pages.
      if (seen.length === 2) await createDraft(ana, { ...draft, title: "Chegou depois" });
    } while (cursor);
    expect(seen).toEqual([...created].reverse());
  });

  it("refuses a cursor that was edited, or made for another list", async () => {
    const ana = await organizer();
    const bia = await organizer();
    await createDraft(ana);
    await createDraft(ana);
    const page = organizerEventListSchema.parse(
      (await ana.get("/organizer/events?limit=1").expect(200)).body,
    );
    const cursor = page.page.nextCursor ?? "";
    await ana.get(`/organizer/events?limit=1&cursor=${encodeURIComponent(cursor)}`).expect(200);
    await bia.get(`/organizer/events?limit=1&cursor=${encodeURIComponent(cursor)}`).expect(400);
    await ana
      .get(`/organizer/events?limit=1&status=DRAFT&cursor=${encodeURIComponent(cursor)}`)
      .expect(400);
    await ana
      .get(`/organizer/events?limit=1&cursor=${encodeURIComponent(`x${cursor}`)}`)
      .expect(400);
  });

  describe("the database refuses what the API never writes", () => {
    let eventId: string;
    let ticketTypeId: string;

    beforeAll(async () => {
      const ana = await organizer();
      const event = await createDraft(ana);
      eventId = event.id;
      ticketTypeId = ticketTypeSchema.parse(
        (await ana.post(`/organizer/events/${event.id}/ticket-types`, ticket).expect(201)).body,
      ).id;
    });

    it.each([
      [
        "more sold and reserved than the capacity",
        `UPDATE ticket_types SET sold = 60, reserved = 41 WHERE id = $1::uuid`,
        "ticket_types_inventory",
      ],
      [
        "a ticket under R$ 1,00",
        `UPDATE ticket_types SET price_cents = 99 WHERE id = $1::uuid`,
        "ticket_types_price_min",
      ],
      [
        "more than 20 per order",
        `UPDATE ticket_types SET max_per_order = 21 WHERE id = $1::uuid`,
        "ticket_types_max_per_order",
      ],
      [
        "a negative sale",
        `UPDATE ticket_types SET sold = -1 WHERE id = $1::uuid`,
        "ticket_types_sold_nonnegative",
      ],
    ])("refuses %s", async (_name, sql, constraint) => {
      await expect(prisma.$executeRawUnsafe(sql, ticketTypeId)).rejects.toThrow(constraint);
    });

    it.each([
      [
        "an event ending before it starts",
        `UPDATE events SET ends_at = starts_at WHERE id = $1::uuid`,
        "events_ends_after_start",
      ],
      [
        "publishing without an image",
        `UPDATE events SET status = 'PUBLISHED', published_at = now() WHERE id = $1::uuid`,
        "events_published_complete",
      ],
      [
        "half a venue",
        `UPDATE events SET venue_city = NULL WHERE id = $1::uuid`,
        "events_venue_complete",
      ],
      [
        "a canceled event without a reason",
        `UPDATE events SET status = 'CANCELED', published_at = now(), canceled_at = now() WHERE id = $1::uuid`,
        "events_status_timestamps",
      ],
      [
        "a published draft date",
        `UPDATE events SET published_at = now() WHERE id = $1::uuid`,
        "events_status_timestamps",
      ],
    ])("refuses %s", async (_name, sql, constraint) => {
      await expect(prisma.$executeRawUnsafe(sql, eventId)).rejects.toThrow(constraint);
    });
  });
});
