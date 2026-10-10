import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("joins the truthy class names and drops the rest", () => {
    expect(cn("a", false, undefined, null, "b", { c: true, d: false })).toBe("a b c");
  });
});
