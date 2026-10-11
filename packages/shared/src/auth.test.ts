import { describe, expect, it } from "vitest";

import {
  loginRequestSchema,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
  verifyEmailRequestSchema,
} from "./auth.js";

const valid = { name: "Ana Souza", email: "ana@exemplo.com", password: "correct horse battery" };

describe("registerRequestSchema", () => {
  it("normalizes the e-mail and trims the name", () => {
    const parsed = registerRequestSchema.parse({
      ...valid,
      name: "  Ana Souza ",
      email: "  Ana@Exemplo.COM ",
    });
    expect(parsed).toEqual(valid);
  });

  it("keeps the password exactly as typed", () => {
    const password = "  spaces stay  ";
    expect(registerRequestSchema.parse({ ...valid, password }).password).toBe(password);
  });

  it("enforces the password length policy", () => {
    expect(
      registerRequestSchema.safeParse({ ...valid, password: "a".repeat(PASSWORD_MIN_LENGTH - 1) })
        .success,
    ).toBe(false);
    expect(
      registerRequestSchema.safeParse({ ...valid, password: "a".repeat(PASSWORD_MIN_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      registerRequestSchema.safeParse({ ...valid, password: "a".repeat(PASSWORD_MAX_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      registerRequestSchema.safeParse({ ...valid, password: "a".repeat(PASSWORD_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it("rejects an invalid or oversized e-mail and an empty or oversized name", () => {
    expect(registerRequestSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(
      false,
    );
    expect(
      registerRequestSchema.safeParse({ ...valid, email: `${"a".repeat(250)}@x.co` }).success,
    ).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(
      false,
    );
  });

  it("rejects fields it does not know, such as a role", () => {
    for (const extra of [{ role: "ADMIN" }, { emailVerified: true }, { id: "x" }]) {
      expect(registerRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});

describe("loginRequestSchema", () => {
  it("accepts a short password (the policy applies to new passwords only)", () => {
    expect(loginRequestSchema.safeParse({ email: valid.email, password: "x" }).success).toBe(true);
  });

  it("rejects an empty or oversized password before anything is hashed", () => {
    expect(loginRequestSchema.safeParse({ email: valid.email, password: "" }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({
        email: valid.email,
        password: "a".repeat(PASSWORD_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      loginRequestSchema.safeParse({ email: valid.email, password: "x", remember: true }).success,
    ).toBe(false);
  });
});

describe("verifyEmailRequestSchema", () => {
  it("accepts a 32-byte base64url token only", () => {
    expect(verifyEmailRequestSchema.safeParse({ token: "A".repeat(43) }).success).toBe(true);
    expect(verifyEmailRequestSchema.safeParse({ token: "A".repeat(42) }).success).toBe(false);
    expect(verifyEmailRequestSchema.safeParse({ token: `${"A".repeat(42)}=` }).success).toBe(false);
    expect(verifyEmailRequestSchema.safeParse({ token: "A".repeat(43), extra: 1 }).success).toBe(
      false,
    );
  });
});
