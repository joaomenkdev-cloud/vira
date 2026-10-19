import { describe, expect, it } from "vitest";

import { dimensionsProblem, fileProblem } from "./image-file";

describe("fileProblem", () => {
  it("takes JPEG, PNG and WebP up to 5 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(fileProblem({ type, size: 5 * 1024 * 1024 })).toBeUndefined();
    }
  });

  it("refuses other formats, empty files and heavier ones", () => {
    expect(fileProblem({ type: "image/gif", size: 10 })).toMatch(/JPEG, PNG ou WebP/);
    expect(fileProblem({ type: "image/svg+xml", size: 10 })).toMatch(/JPEG, PNG ou WebP/);
    expect(fileProblem({ type: "", size: 10 })).toMatch(/JPEG, PNG ou WebP/);
    expect(fileProblem({ type: "image/png", size: 0 })).toMatch(/vazio/);
    expect(fileProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });
});

describe("dimensionsProblem", () => {
  it("asks for at least 1200 × 600 pixels and says what the file has", () => {
    expect(dimensionsProblem(1200, 600)).toBeUndefined();
    expect(dimensionsProblem(1199, 900)).toMatch(/1199 × 900/);
    expect(dimensionsProblem(4000, 599)).toMatch(/1200 × 600/);
  });
});
