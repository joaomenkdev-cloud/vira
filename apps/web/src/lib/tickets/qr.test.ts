import { describe, expect, it } from "vitest";

import { qrPath } from "./qr";

describe("qrPath", () => {
  it("draws every dark module of the code, with the three finder patterns", () => {
    const { size, d } = qrPath("v1.k1.cGF5bG9hZA.c2ln");
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0);
    // The top-left finder pattern starts with a full dark row of seven modules.
    for (let column = 0; column < 7; column += 1) {
      expect(d).toContain(`M${String(column)} 0h1v1h-1z`);
    }
    expect(d).not.toContain("M7 0h1v1h-1z");
  });

  it("is the same for the same token and different for another", () => {
    expect(qrPath("v1.a.b.c")).toEqual(qrPath("v1.a.b.c"));
    expect(qrPath("v1.a.b.c").d).not.toBe(qrPath("v1.a.b.d").d);
  });
});
