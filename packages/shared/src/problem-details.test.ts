import { describe, expect, it } from "vitest";

import { problemDetailsSchema } from "./problem-details.js";

describe("problemDetailsSchema", () => {
  it("accepts a validation problem with field errors", () => {
    const parsed = problemDetailsSchema.safeParse({
      type: "https://example.test/problems#validation-failed",
      title: "Requisição inválida",
      status: 400,
      requestId: "req-1",
      errors: [{ path: "items.0.quantity", message: "Too small" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects non-error statuses", () => {
    const parsed = problemDetailsSchema.safeParse({ type: "x", title: "x", status: 200 });
    expect(parsed.success).toBe(false);
  });
});
