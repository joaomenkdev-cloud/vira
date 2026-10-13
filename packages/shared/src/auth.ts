import { z } from "zod";

import { ROLES } from "./roles.js";

/**
 * Contracts of the password-based authentication endpoints (docs/API.md#autenticação-auth).
 * Every request schema is strict: unknown keys are rejected, so a client can never
 * smuggle in a role or any other field (OWASP API3, mass assignment).
 */

export const PASSWORD_MIN_LENGTH = 8;
/** Upper bound that keeps a hostile body from turning argon2 into a CPU sink. */
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 120;
/** RFC 5321 limit for a forward path. */
export const EMAIL_MAX_LENGTH = 254;

/** Trimmed, lower-cased and validated, so every use of an e-mail sees the same form. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email())
  .meta({
    description: "Endereço de e-mail (normalizado em minúsculas)",
    example: "ana@exemplo.com",
  });

export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NAME_MAX_LENGTH)
  .meta({ description: "Nome da pessoa", example: "Ana Souza" });

/** Password policy for new passwords (ADR-0005). The value is never trimmed or altered. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .meta({ description: `Senha de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres` });

/** 32 random bytes in base64url, as sent in e-mail links. */
export const verificationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)
  .meta({ description: "Token recebido por e-mail" });

export const registerRequestSchema = z
  .strictObject({ name: nameSchema, email: emailSchema, password: newPasswordSchema })
  .meta({ id: "RegisterRequest" });

/** Same body for a new and for an already registered e-mail (anti-enumeration). */
export const registerResponseSchema = z
  .strictObject({ status: z.literal("accepted") })
  .meta({ id: "RegisterResponse" });

export const verifyEmailRequestSchema = z
  .strictObject({ token: verificationTokenSchema })
  .meta({ id: "VerifyEmailRequest" });

/**
 * Login accepts any non-empty password up to the maximum: whether it satisfies the
 * policy for new passwords is not something a failed login should reveal.
 */
export const loginRequestSchema = z
  .strictObject({ email: emailSchema, password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .meta({ id: "LoginRequest" });

export const publicUserSchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: z.enum(ROLES),
    emailVerified: z.boolean(),
  })
  .meta({ id: "User" });

export const userResponseSchema = z
  .strictObject({ user: publicUserSchema })
  .meta({ id: "UserResponse" });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;

/** Sessions and CSRF (N4, docs/API.md#autenticação-auth). */

export const csrfTokenResponseSchema = z
  .strictObject({
    csrfToken: z.string().meta({
      description: "Enviar no header `X-CSRF-Token` em `POST`/`PUT`/`PATCH`/`DELETE`",
    }),
  })
  .meta({ id: "CsrfTokenResponse" });

export const sessionIdSchema = z.uuid().meta({ description: "Id da sessão" });

export const sessionSchema = z
  .strictObject({
    id: sessionIdSchema,
    authenticatedAt: z.iso.datetime().meta({ description: "Quando o login foi feito" }),
    lastRefreshedAt: z.iso.datetime().meta({ description: "Última renovação da sessão" }),
    expiresAt: z.iso.datetime().meta({ description: "Quando a sessão acaba se não for usada" }),
    current: z.boolean().meta({ description: "É a sessão desta requisição" }),
  })
  .meta({ id: "Session" });

export const sessionListResponseSchema = z
  .strictObject({ data: z.array(sessionSchema) })
  .meta({ id: "SessionList" });

export type CsrfTokenResponse = z.infer<typeof csrfTokenResponseSchema>;
export type SessionSummary = z.infer<typeof sessionSchema>;
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;
