import { describe, expect, it } from "vitest";

import { isSafeReturnPath, returnPathFrom } from "./safe-path";

describe("isSafeReturnPath", () => {
  it.each(["/", "/conta", "/eventos/show?data=2026-03-14#ingressos"])("accepts %s", (path) => {
    expect(isSafeReturnPath(path)).toBe(true);
  });

  it.each([
    "",
    "conta",
    "//evil.example",
    "/\\evil.example",
    "/\\/evil.example",
    "https://evil.example",
    "javascript:alert(1)",
    "/com espaço",
    "/linha\nnova",
    `/${"a".repeat(512)}`,
  ])("refuses %j", (path) => {
    expect(isSafeReturnPath(path)).toBe(false);
  });
});

describe("returnPathFrom", () => {
  it("falls back when the value is missing or unsafe", () => {
    expect(returnPathFrom(null)).toBe("/");
    expect(returnPathFrom(undefined, "/conta")).toBe("/conta");
    expect(returnPathFrom("//evil.example")).toBe("/");
    expect(returnPathFrom("/conta")).toBe("/conta");
  });
});
