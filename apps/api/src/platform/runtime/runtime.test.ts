import { describe, expect, it } from "vitest";

import { uuidV7Generator } from "./runtime.js";

describe("uuidV7Generator", () => {
  it("generates time-ordered UUID v7 identifiers", () => {
    const ids = Array.from({ length: 50 }, () => uuidV7Generator.next());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
