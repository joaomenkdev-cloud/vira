import { describe, expect, it } from "vitest";

import { eventSlugSchema, listCatalogEventsQuerySchema } from "./catalog.js";

describe("storefront query", () => {
  it("trims the search and defaults the page size", () => {
    expect(listCatalogEventsQuerySchema.parse({ q: "  forró ", city: " Recife " })).toEqual({
      q: "forró",
      city: "Recife",
      limit: 20,
    });
  });

  it("reads the limit from the query string", () => {
    expect(listCatalogEventsQuerySchema.parse({ limit: "12" }).limit).toBe(12);
  });

  it.each([
    [{ q: "a" }],
    [{ q: "x".repeat(81) }],
    [{ limit: "0" }],
    [{ limit: "51" }],
    [{ from: "amanhã" }],
    [{ from: "2026-12-01T00:00:00Z", to: "2026-12-01T00:00:00Z" }],
    [{ status: "DRAFT" }],
    [{ organizerId: "0192a0e4-0000-7000-8000-000000000001" }],
  ])("refuses %j", (query) => {
    expect(listCatalogEventsQuerySchema.safeParse(query).success).toBe(false);
  });

  it("takes a date range that ends after it starts", () => {
    expect(
      listCatalogEventsQuerySchema.safeParse({
        from: "2026-12-01T00:00:00-03:00",
        to: "2026-12-31T23:59:59-03:00",
      }).success,
    ).toBe(true);
  });
});

describe("event slug", () => {
  it.each(["noite-de-forro-a1b2c3", "x"])("takes %s", (slug) => {
    expect(eventSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(["Noite", "noite--forro", "-noite", "noite_forro", "a".repeat(81), "../x"])(
    "refuses %s",
    (slug) => {
      expect(eventSlugSchema.safeParse(slug).success).toBe(false);
    },
  );
});
