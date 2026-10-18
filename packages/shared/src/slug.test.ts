import { describe, expect, it } from "vitest";

import { slugify } from "./slug.js";

describe("slugify", () => {
  it("keeps lower-case ASCII words joined by dashes", () => {
    expect(slugify("Coletivo São João", 60)).toBe("coletivo-sao-joao");
    expect(slugify("  Festa   de 15 anos!! ", 60)).toBe("festa-de-15-anos");
  });

  it("cuts to the maximum length without leaving a dash at the end", () => {
    expect(slugify("abc def", 4)).toBe("abc");
  });

  it("is empty when nothing survives", () => {
    expect(slugify("🎉🎉", 60)).toBe("");
  });
});
