import { describe, expect, it } from "vitest";

import { isDesignSystemEnabled } from "./design-system";

describe("isDesignSystemEnabled", () => {
  it("is on in development", () => {
    expect(isDesignSystemEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("is off in production unless explicitly asked for", () => {
    expect(isDesignSystemEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(isDesignSystemEnabled({ NODE_ENV: "production", VIRA_DESIGN_SYSTEM: "1" })).toBe(false);
    expect(isDesignSystemEnabled({ NODE_ENV: "production", VIRA_DESIGN_SYSTEM: "true" })).toBe(
      true,
    );
  });

  it("is never served from a Vercel deployment", () => {
    expect(
      isDesignSystemEnabled({ NODE_ENV: "development", VERCEL: "1", VIRA_DESIGN_SYSTEM: "true" }),
    ).toBe(false);
  });
});
