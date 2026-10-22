import { describe, expect, it } from "vitest";

import { deleteAccountRequestSchema } from "./privacy.js";

describe("deleteAccountRequestSchema", () => {
  it("takes the confirmation word, with or without the password", () => {
    expect(deleteAccountRequestSchema.safeParse({ confirm: "EXCLUIR" }).success).toBe(true);
    expect(
      deleteAccountRequestSchema.safeParse({ confirm: "EXCLUIR", password: "segredo" }).success,
    ).toBe(true);
  });

  it("refuses any other word, a blank password and unknown fields", () => {
    expect(deleteAccountRequestSchema.safeParse({ confirm: "excluir" }).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountRequestSchema.safeParse({ confirm: "EXCLUIR", password: "" }).success).toBe(
      false,
    );
    expect(
      deleteAccountRequestSchema.safeParse({ confirm: "EXCLUIR", userId: "someone" }).success,
    ).toBe(false);
  });
});
