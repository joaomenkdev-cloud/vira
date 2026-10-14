import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import {
  RateLimitExceededError,
  rateLimitHeaders,
} from "../../../platform/rate-limit/rate-limiter.js";
import type { AuthenticatedUser } from "../../../platform/security/access-policy.js";
import {
  AccountNotFoundError,
  BreachedPasswordError,
  EmailNotVerifiedError,
  IncorrectPasswordError,
  InvalidCredentialsError,
  InvalidTokenError,
  PasswordNotSetError,
  SameEmailError,
  SessionNotFoundError,
} from "../application/errors.js";
import type { RequestContext } from "../application/request-context.js";

export function contextOf(request: Request): RequestContext {
  return typeof request.id === "string" ? { requestId: request.id } : {};
}

/** Which request fields the field-level errors point at, for routes that name them differently. */
export interface ProblemFields {
  /** The new password (`password` on sign-up and reset, `newPassword` on change). */
  readonly newPassword?: string;
}

/** The documented answer for each way a use case can refuse. */
export async function asProblem<T>(work: () => Promise<T>, fields: ProblemFields = {}): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidCredentialsError) throw new ProblemException("invalid-credentials");
    if (error instanceof EmailNotVerifiedError) throw new ProblemException("email-not-verified");
    if (error instanceof InvalidTokenError) throw new ProblemException("token-expired");
    if (error instanceof SessionNotFoundError) throw new ProblemException("not-found");
    if (error instanceof AccountNotFoundError) throw new ProblemException("unauthenticated");
    if (error instanceof PasswordNotSetError) throw new ProblemException("password-not-set");
    if (error instanceof BreachedPasswordError) {
      throw new ProblemException("breached-password", {
        errors: [
          {
            path: fields.newPassword ?? "password",
            message: "Esta senha aparece em vazamentos de dados conhecidos; escolha outra.",
          },
        ],
      });
    }
    if (error instanceof IncorrectPasswordError) {
      throw new ProblemException("incorrect-password", {
        errors: [{ path: "currentPassword", message: "Senha atual incorreta." }],
      });
    }
    if (error instanceof SameEmailError) {
      throw new ProblemException("validation-failed", {
        errors: [{ path: "email", message: "Este já é o e-mail da conta." }],
      });
    }
    if (error instanceof RateLimitExceededError) {
      throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
    }
    throw error;
  }
}

/** The caller of a route that requires a role; the access guard already ran. */
export function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}
