import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** The design-system page must show every colour token, so none goes unreviewed. */

const tokensPath = createRequire(import.meta.url).resolve("@vira/ui/tokens.css");
const tokens = readFileSync(tokensPath, "utf8");
const page = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");

const colourTokens = [...tokens.matchAll(/--vira-([\w-]+):\s*(?:#|rgb)/g)].map((m) => m[1]);

describe("/dev/design-system", () => {
  it("finds the colour tokens", () => {
    expect(colourTokens.length).toBeGreaterThan(20);
  });

  it.each(colourTokens)("shows the %s colour", (token) => {
    expect(page).toMatch(new RegExp(`(bg|text)-${token}[\\s"]`));
  });
});
