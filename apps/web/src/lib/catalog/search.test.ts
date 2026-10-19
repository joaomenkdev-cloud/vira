import { describe, expect, it } from "vitest";

import { exploreHref, parseExploreSearch, weekendRange } from "./search";

const WEDNESDAY = new Date("2026-03-11T15:00:00.000Z");

describe("weekendRange", () => {
  it.each([
    ["on a Wednesday, the coming weekend", "2026-03-11T15:00:00.000Z"],
    ["on Friday night in Brasília (already Saturday in UTC)", "2026-03-14T02:30:00.000Z"],
    ["on Saturday", "2026-03-14T18:00:00.000Z"],
    ["on Sunday night", "2026-03-16T02:00:00.000Z"],
  ])("%s: Saturday 00:00 to Monday 00:00, Brasília time", (_, now) => {
    expect(weekendRange(new Date(now))).toEqual({
      from: "2026-03-14T00:00:00-03:00",
      to: "2026-03-16T00:00:00-03:00",
    });
  });

  it("moves to the next weekend on Monday", () => {
    expect(weekendRange(new Date("2026-03-16T12:00:00.000Z"))).toEqual({
      from: "2026-03-21T00:00:00-03:00",
      to: "2026-03-23T00:00:00-03:00",
    });
  });
});

describe("parseExploreSearch", () => {
  it("asks for everything upcoming without filters", () => {
    expect(parseExploreSearch({}, WEDNESDAY)).toEqual({
      q: "",
      city: "",
      weekend: false,
      qError: null,
      query: {},
      filtered: false,
    });
  });

  it("maps the Portuguese parameters to the API's", () => {
    const search = parseExploreSearch(
      { q: "  forró ", cidade: "Recife", periodo: "fim-de-semana", cursor: "abc" },
      WEDNESDAY,
    );
    expect(search.query).toEqual({
      q: "forró",
      city: "Recife",
      from: "2026-03-14T00:00:00-03:00",
      to: "2026-03-16T00:00:00-03:00",
      cursor: "abc",
    });
    expect(search.filtered).toBe(true);
  });

  it("explains a search too short instead of sending it", () => {
    const search = parseExploreSearch({ q: "a" }, WEDNESDAY);
    expect(search.qError).toBe("Digite pelo menos 2 letras para buscar.");
    expect(search.query).toEqual({});
    expect(search.q).toBe("a");
  });

  it("takes the first of repeated parameters and cuts what is too long", () => {
    const search = parseExploreSearch(
      { q: ["show", "teatro"], cidade: "x".repeat(200), cursor: "c".repeat(600) },
      WEDNESDAY,
    );
    expect(search.query.q).toBe("show");
    expect(search.city).toHaveLength(80);
    expect(search.query.cursor).toBeUndefined();
  });

  it("ignores an unknown period", () => {
    expect(parseExploreSearch({ periodo: "amanha" }, WEDNESDAY).weekend).toBe(false);
  });
});

describe("exploreHref", () => {
  const search = { q: "forró", city: "Recife", weekend: false };

  it("keeps the search and adds the next page", () => {
    expect(exploreHref(search, { cursor: "next" })).toBe(
      "/eventos?q=forr%C3%B3&cidade=Recife&cursor=next",
    );
  });

  it("turns the weekend chip on and off, back to the first page", () => {
    expect(exploreHref(search, { weekend: true })).toBe(
      "/eventos?q=forr%C3%B3&cidade=Recife&periodo=fim-de-semana",
    );
    expect(exploreHref({ q: "", city: "", weekend: true }, { weekend: false })).toBe("/eventos");
  });
});
