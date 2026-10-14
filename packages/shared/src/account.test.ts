import { describe, expect, it } from "vitest";

import {
  becomeOrganizerRequestSchema,
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  ORGANIZER_DISPLAY_NAME_MAX_LENGTH,
  resetPasswordRequestSchema,
  updateProfileRequestSchema,
} from "./account.js";
import { PASSWORD_MIN_LENGTH } from "./auth.js";

const token = "a".repeat(43);

describe("account request schemas", () => {
  it("normalizes e-mails like the sign-up does", () => {
    expect(forgotPasswordRequestSchema.parse({ email: " Ana@Exemplo.COM " })).toEqual({
      email: "ana@exemplo.com",
    });
    expect(
      changeEmailRequestSchema.parse({ email: "NOVA@exemplo.com", currentPassword: "x" }).email,
    ).toBe("nova@exemplo.com");
  });

  it("apply the new-password policy to reset and change, but not to the current password", () => {
    const short = "a".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(resetPasswordRequestSchema.safeParse({ token, password: short }).success).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: "x", newPassword: short }).success,
    ).toBe(false);
    // An old password may predate the policy; it only has to be the right one.
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: "x", newPassword: "long enough" })
        .success,
    ).toBe(true);
  });

  it("reject a malformed reset token", () => {
    expect(resetPasswordRequestSchema.safeParse({ token: "abc", password: "long enough" })).toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it.each([
    ["PATCH /me with a role", updateProfileRequestSchema, { name: "Ana", role: "ADMIN" }],
    ["PATCH /me with an e-mail", updateProfileRequestSchema, { name: "Ana", email: "a@b.co" }],
    [
      "PATCH /me with e-mail verification",
      updateProfileRequestSchema,
      { name: "Ana", emailVerified: true },
    ],
    [
      "POST /me/organizer with a role",
      becomeOrganizerRequestSchema,
      { displayName: "Coletivo", role: "ADMIN" },
    ],
    [
      "POST /me/organizer with a slug",
      becomeOrganizerRequestSchema,
      { displayName: "C", slug: "x" },
    ],
    [
      "reset with an e-mail",
      resetPasswordRequestSchema,
      { token, password: "long enough", email: "a@b.co" },
    ],
  ])("reject unknown fields: %s", (_case, schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });

  it("trim the organizer name and bound its length", () => {
    expect(becomeOrganizerRequestSchema.parse({ displayName: "  Coletivo Vira " })).toEqual({
      displayName: "Coletivo Vira",
    });
    expect(
      becomeOrganizerRequestSchema.safeParse({
        displayName: "a".repeat(ORGANIZER_DISPLAY_NAME_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(becomeOrganizerRequestSchema.safeParse({ displayName: "   " }).success).toBe(false);
  });
});
