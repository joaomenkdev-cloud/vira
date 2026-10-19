import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri, type ProblemType } from "../src/platform/errors/problem-types.js";
import { AccessTokens } from "../src/platform/security/access-token.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";

const USER_ID = "0192a0e4-0000-7000-8000-000000000001";
const SESSION_ID = "0192a0e4-0000-7000-8000-0000000000aa";
const EVENT_ID = "0192a0e4-0000-7000-8000-0000000000e1";

type Method = "get" | "post" | "patch" | "delete";

const event = {
  title: "Noite de forró",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00Z",
  timezone: "America/Sao_Paulo",
};
const ticket = { name: "Pista", priceCents: 8000, capacity: 100 };
const upload = { contentType: "image/jpeg", sizeBytes: 734_003 };

const ROUTES: [Method, string][] = [
  ["get", "/api/v1/organizer/events"],
  ["post", "/api/v1/organizer/events"],
  ["get", `/api/v1/organizer/events/${EVENT_ID}`],
  ["patch", `/api/v1/organizer/events/${EVENT_ID}`],
  ["delete", `/api/v1/organizer/events/${EVENT_ID}`],
  ["post", `/api/v1/organizer/events/${EVENT_ID}/publish`],
  ["post", `/api/v1/organizer/events/${EVENT_ID}/cancel`],
  ["post", `/api/v1/organizer/events/${EVENT_ID}/ticket-types`],
  ["post", `/api/v1/organizer/events/${EVENT_ID}/image/upload-url`],
  ["post", `/api/v1/organizer/events/${EVENT_ID}/image`],
  ["patch", `/api/v1/organizer/ticket-types/${EVENT_ID}`],
  ["delete", `/api/v1/organizer/ticket-types/${EVENT_ID}`],
];

// No database here: whatever is refused below is refused before reaching it.
describe("organizer event endpoints: what is refused at the door", () => {
  let testApp: TestApp;
  let organizer: string;
  let buyer: string;
  const server = () => testApp.app.getHttpServer();
  const bearerFor = (role: "BUYER" | "ORGANIZER") =>
    `Bearer ${testApp.app.get(AccessTokens).issue({ sub: USER_ID, role, sid: SESSION_ID }).token}`;

  function expectProblem(body: unknown, type: ProblemType) {
    expect(problemDetailsSchema.parse(body).type).toBe(problemTypeUri(type));
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    organizer = bearerFor("ORGANIZER");
    buyer = bearerFor("BUYER");
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it.each(ROUTES)("%s %s answers 401 without a session", async (method, path) => {
    const response = await request(server())[method](path).send({}).expect(401);
    expectProblem(response.body, "unauthenticated");
  });

  it.each(ROUTES)("%s %s answers 403 to a buyer", async (method, path) => {
    const response = await request(server())
      [method](path)
      .set("Authorization", buyer)
      .send({})
      .expect(403);
    expectProblem(response.body, "forbidden");
  });

  describe("mass assignment (OWASP API3): fields the routes do not take are 400", () => {
    it.each([
      ["post", "/api/v1/organizer/events", { ...event, status: "PUBLISHED" }],
      ["post", "/api/v1/organizer/events", { ...event, organizerId: USER_ID }],
      ["post", "/api/v1/organizer/events", { ...event, descriptionHtml: "<script>x</script>" }],
      ["post", "/api/v1/organizer/events", { ...event, isDemo: true }],
      ["post", "/api/v1/organizer/events", { ...event, publishedAt: "2026-10-17T00:00:00Z" }],
      ["patch", `/api/v1/organizer/events/${EVENT_ID}`, { status: "PUBLISHED" }],
      ["patch", `/api/v1/organizer/events/${EVENT_ID}`, { slug: "outro-evento" }],
      ["patch", `/api/v1/organizer/events/${EVENT_ID}`, { imageKey: "events/a/b.webp" }],
      ["post", `/api/v1/organizer/events/${EVENT_ID}/ticket-types`, { ...ticket, sold: 0 }],
      [
        "post",
        `/api/v1/organizer/events/${EVENT_ID}/ticket-types`,
        { ...ticket, eventId: EVENT_ID },
      ],
      ["patch", `/api/v1/organizer/ticket-types/${EVENT_ID}`, { reserved: 0 }],
      ["patch", `/api/v1/organizer/ticket-types/${EVENT_ID}`, { eventId: EVENT_ID }],
      ["post", `/api/v1/organizer/events/${EVENT_ID}/cancel`, { reason: "Chuva", refund: false }],
      [
        "post",
        `/api/v1/organizer/events/${EVENT_ID}/image/upload-url`,
        { ...upload, key: `events/${EVENT_ID}/escolhida.jpg` },
      ],
      [
        "post",
        `/api/v1/organizer/events/${EVENT_ID}/image/upload-url`,
        { ...upload, bucket: "outro" },
      ],
      [
        "post",
        `/api/v1/organizer/events/${EVENT_ID}/image`,
        { uploadId: USER_ID, alt: "Pista", url: "http://169.254.169.254/latest" },
      ],
      [
        "post",
        `/api/v1/organizer/events/${EVENT_ID}/image`,
        { uploadId: USER_ID, alt: "Pista", width: 1 },
      ],
    ] as [Method, string, object][])("%s %s %j", async (method, path, body) => {
      const response = await request(server())
        [method](path)
        .set("Authorization", organizer)
        .send(body)
        .expect(400);
      expectProblem(response.body, "validation-failed");
    });
  });

  describe("validation", () => {
    it.each([`/api/v1/organizer/events/not-a-uuid`, `/api/v1/organizer/events/1%20OR%201=1`])(
      "refuses a malformed id in %s",
      async (path) => {
        await request(server()).get(path).set("Authorization", organizer).expect(400);
      },
    );

    it("refuses an end before the start and an unknown time zone, naming the fields", async () => {
      const response = await request(server())
        .post("/api/v1/organizer/events")
        .set("Authorization", organizer)
        .send({ ...event, endsAt: "2026-12-05T21:00:00Z", timezone: "Mars/Olympus" })
        .expect(400);
      const paths = problemDetailsSchema.parse(response.body).errors?.map((e) => e.path);
      expect(paths).toEqual(expect.arrayContaining(["timezone"]));
    });

    it("refuses a description above 20 000 characters", async () => {
      await request(server())
        .post("/api/v1/organizer/events")
        .set("Authorization", organizer)
        .send({ ...event, descriptionMd: "a".repeat(20_001) })
        .expect(400);
    });

    it("refuses a free ticket (paid only in the MVP) and a price in decimals", async () => {
      for (const priceCents of [0, 99, 80.5]) {
        await request(server())
          .post(`/api/v1/organizer/events/${EVENT_ID}/ticket-types`)
          .set("Authorization", organizer)
          .send({ ...ticket, priceCents })
          .expect(400);
      }
    });

    it.each([
      ["SVG", { contentType: "image/svg+xml", sizeBytes: 100 }],
      ["GIF", { contentType: "image/gif", sizeBytes: 100 }],
      ["HTML", { contentType: "text/html", sizeBytes: 100 }],
      ["over 5 MB", { contentType: "image/png", sizeBytes: 5 * 1024 * 1024 + 1 }],
      ["empty", { contentType: "image/png", sizeBytes: 0 }],
      ["without a size", { contentType: "image/png" }],
    ])("refuses an upload URL for a file that is %s", async (_case, body) => {
      const response = await request(server())
        .post(`/api/v1/organizer/events/${EVENT_ID}/image/upload-url`)
        .set("Authorization", organizer)
        .send(body)
        .expect(400);
      expectProblem(response.body, "validation-failed");
    });

    it("refuses a confirmation without a text alternative or with a malformed upload id", async () => {
      for (const body of [
        { uploadId: USER_ID },
        { uploadId: USER_ID, alt: "  " },
        { uploadId: "../../outro-evento", alt: "Pista cheia" },
      ]) {
        await request(server())
          .post(`/api/v1/organizer/events/${EVENT_ID}/image`)
          .set("Authorization", organizer)
          .send(body)
          .expect(400);
      }
    });

    it("refuses a page size above 50 and an unknown status filter", async () => {
      await request(server())
        .get("/api/v1/organizer/events?limit=51")
        .set("Authorization", organizer)
        .expect(400);
      await request(server())
        .get("/api/v1/organizer/events?status=ARCHIVED")
        .set("Authorization", organizer)
        .expect(400);
    });
  });
});
