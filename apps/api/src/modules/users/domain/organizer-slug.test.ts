import { describe, expect, it } from "vitest";

import { slugCandidates, slugFrom } from "./organizer-slug.js";

/** The CHECK constraint of organizer_profiles.slug. */
const SLUG_FORMAT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe("slugFrom", () => {
  it.each([
    ["Coletivo Vira", "coletivo-vira"],
    ["  Festa  Junina — São João! ", "festa-junina-sao-joao"],
    ["AÇÃO & Reação 2026", "acao-reacao-2026"],
    ["Ｆｕｌｌｗｉｄｔｈ", "fullwidth"],
    ["🎉🎶", "organizador"],
    ["---", "organizador"],
  ])("%j becomes %j", (displayName, slug) => {
    expect(slugFrom(displayName)).toBe(slug);
  });

  it("always satisfies the database format and stays short", () => {
    for (const name of ["a".repeat(200), `${"ab ".repeat(40)}!`, "x-".repeat(50), "Çà"]) {
      const slug = slugFrom(name);
      expect(slug).toMatch(SLUG_FORMAT);
      expect(slug.length).toBeLessThanOrEqual(60);
    }
  });
});

describe("slugCandidates", () => {
  it("tries the base, numbered variants and then a random suffix", () => {
    expect(slugCandidates("vira", "a1b2c3")).toEqual([
      "vira",
      "vira-2",
      "vira-3",
      "vira-4",
      "vira-5",
      "vira-a1b2c3",
    ]);
  });
});
