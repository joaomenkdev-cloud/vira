import { describe, expect, it } from "vitest";

import { PROBLEM_TYPES, problemTypeForStatus, problemTypeUri } from "./problem-types.js";

describe("problem types", () => {
  it("maps a bare status to its generic type, even when other types share the status", () => {
    expect(problemTypeForStatus(401)).toBe("unauthenticated");
    expect(problemTypeForStatus(403)).toBe("forbidden");
    expect(problemTypeForStatus(410)).toBe("token-expired");
  });

  it("documents each type with the status the API reference lists", () => {
    expect(PROBLEM_TYPES["invalid-credentials"].status).toBe(401);
    expect(PROBLEM_TYPES["email-not-verified"].status).toBe(403);
    expect(PROBLEM_TYPES["csrf-failed"].status).toBe(403);
    expect(PROBLEM_TYPES["token-expired"].status).toBe(410);
  });

  it("points every type at its anchor in docs/API.md", () => {
    expect(problemTypeUri("invalid-credentials")).toBe(
      "https://github.com/joaomenkdev-cloud/vira/blob/main/docs/API.md#invalid-credentials",
    );
  });
});
