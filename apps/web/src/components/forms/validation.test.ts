import { describe, expect, it } from "vitest";

import {
  validateCurrentPassword,
  validateEmail,
  validateName,
  validateNewPassword,
  validateOrganizerName,
} from "./validation";

describe("field validation", () => {
  it("asks for a well-formed e-mail", () => {
    expect(validateEmail("")).toBe("Informe seu e-mail.");
    expect(validateEmail("ana")).toMatch(/e-mail válido/);
    expect(validateEmail("  Ana@Exemplo.com ")).toBeUndefined();
  });

  it("asks for a name within the limit", () => {
    expect(validateName("   ")).toBe("Informe seu nome.");
    expect(validateName("a".repeat(121))).toMatch(/até 120/);
    expect(validateName("Ana Souza")).toBeUndefined();
    expect(validateOrganizerName("a".repeat(81))).toMatch(/até 80/);
  });

  it("applies the password policy to new passwords only", () => {
    expect(validateNewPassword("")).toBe("Crie uma senha.");
    expect(validateNewPassword("1234567")).toMatch(/pelo menos 8/);
    expect(validateNewPassword("a".repeat(129))).toMatch(/até 128/);
    expect(validateNewPassword(" spaces count ")).toBeUndefined();

    // A login never reveals the policy: a short password is just sent.
    expect(validateCurrentPassword("")).toBe("Informe sua senha.");
    expect(validateCurrentPassword("123")).toBeUndefined();
  });
});
