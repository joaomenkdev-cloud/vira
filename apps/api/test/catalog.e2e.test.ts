import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { CursorCodec } from "../src/platform/pagination/cursor-codec.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";

// No database here: whatever is refused below is refused before reaching it.
describe("storefront endpoints: what is refused at the door", () => {
  let testApp: TestApp;
  const server = () => testApp.app.getHttpServer();

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it.each([
    ["a search of one letter", "q=a"],
    ["a page of 51", "limit=51"],
    ["a date that is not one", "from=amanha"],
    ["a range that ends before it starts", "from=2026-12-02T00:00:00Z&to=2026-12-01T00:00:00Z"],
    ["a filter it does not take", "status=DRAFT"],
    ["an organizer filter", "organizerId=0192a0e4-0000-7000-8000-000000000001"],
  ])("refuses %s with 400", async (_, query) => {
    const response = await request(server()).get(`/api/v1/events?${query}`).expect(400);
    expect(problemDetailsSchema.parse(response.body).type).toBe(
      problemTypeUri("validation-failed"),
    );
  });

  it("refuses a forged cursor", async () => {
    const response = await request(server())
      .get("/api/v1/events?cursor=eyJ4IjoxfQ.AAAA")
      .expect(400);
    expect(problemDetailsSchema.parse(response.body).errors).toEqual([
      { path: "cursor", message: "cursor inválido" },
    ]);
  });

  it("refuses a cursor issued for another search", async () => {
    const cursors = testApp.app.get(CursorCodec);
    const scope = `catalog:${JSON.stringify(["forró", null, null, null])}`;
    const cursor = cursors.encode(scope, {
      key: "2026-12-05T22:00:00.000Z",
      id: "0192a0e4-0000-7000-8000-0000000000e1",
    });
    await request(server()).get(`/api/v1/events?q=samba&cursor=${cursor}`).expect(400);
  });

  it("refuses a cursor of the organizer's own list", async () => {
    const cursor = testApp.app.get(CursorCodec).encode("organizer-events:x:*", {
      key: "2026-12-05T22:00:00.000Z",
      id: "0192a0e4-0000-7000-8000-0000000000e1",
    });
    await request(server()).get(`/api/v1/events?cursor=${cursor}`).expect(400);
  });

  it.each(["Noite-De-Forro", "noite_forro", "a".repeat(81)])(
    "refuses the slug %s with 400",
    async (slug) => {
      await request(server()).get(`/api/v1/events/${slug}`).expect(400);
    },
  );
});
