import { z } from "zod";

import {
  emailSchema,
  nameSchema,
  newPasswordSchema,
  PASSWORD_MAX_LENGTH,
  publicUserSchema,
  verificationTokenSchema,
} from "./auth.js";

/**
 * Contracts of password reset and of the account routes (N6, docs/API.md). Like every
 * request schema of the API they are strict: a `role`, `email` or any other field the
 * route does not take is a `400`, never silently applied (OWASP API3, mass assignment).
 */

export const ORGANIZER_DISPLAY_NAME_MAX_LENGTH = 80;

/** A password the caller already has: any non-empty value up to the maximum length. */
export const currentPasswordSchema = z
  .string()
  .min(1)
  .max(PASSWORD_MAX_LENGTH)
  .meta({ description: "Senha atual da conta" });

export const forgotPasswordRequestSchema = z
  .strictObject({ email: emailSchema })
  .meta({ id: "ForgotPasswordRequest" });

/** Same body whether or not the address has an account (anti-enumeration). */
export const acceptedResponseSchema = z
  .strictObject({ status: z.literal("accepted") })
  .meta({ id: "AcceptedResponse" });

export const resetPasswordRequestSchema = z
  .strictObject({ token: verificationTokenSchema, password: newPasswordSchema })
  .meta({ id: "ResetPasswordRequest" });

export const changePasswordRequestSchema = z
  .strictObject({ currentPassword: currentPasswordSchema, newPassword: newPasswordSchema })
  .meta({ id: "ChangePasswordRequest" });

export const changeEmailRequestSchema = z
  .strictObject({ email: emailSchema, currentPassword: currentPasswordSchema })
  .meta({ id: "ChangeEmailRequest" });

export const confirmEmailChangeRequestSchema = z
  .strictObject({ token: verificationTokenSchema })
  .meta({ id: "ConfirmEmailChangeRequest" });

/** Only the name can be edited here; e-mail and password have routes of their own. */
export const updateProfileRequestSchema = z
  .strictObject({ name: nameSchema })
  .meta({ id: "UpdateProfileRequest" });

export const organizerDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ORGANIZER_DISPLAY_NAME_MAX_LENGTH)
  .meta({ description: "Nome público do organizador", example: "Coletivo Vira" });

export const becomeOrganizerRequestSchema = z
  .strictObject({ displayName: organizerDisplayNameSchema })
  .meta({ id: "BecomeOrganizerRequest" });

export const organizerProfileSchema = z
  .strictObject({
    displayName: z.string(),
    slug: z.string().meta({ description: "Identificador público, gerado a partir do nome" }),
  })
  .meta({ id: "OrganizerProfile" });

export const organizerProfileResponseSchema = z
  .strictObject({ organizerProfile: organizerProfileSchema })
  .meta({ id: "OrganizerProfileResponse" });

/** The caller's own account, as `GET /me` shows it. */
export const accountSchema = publicUserSchema
  .extend({
    hasPassword: z.boolean().meta({
      description: "Falso em contas só de login social (a senha é criada por “esqueci a senha”)",
    }),
    organizer: organizerProfileSchema.optional(),
  })
  .meta({ id: "Account" });

export const accountResponseSchema = z
  .strictObject({ user: accountSchema })
  .meta({ id: "AccountResponse" });

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;
export type ConfirmEmailChangeRequest = z.infer<typeof confirmEmailChangeRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type BecomeOrganizerRequest = z.infer<typeof becomeOrganizerRequestSchema>;
export type OrganizerProfile = z.infer<typeof organizerProfileSchema>;
export type OrganizerProfileResponse = z.infer<typeof organizerProfileResponseSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountResponse = z.infer<typeof accountResponseSchema>;
