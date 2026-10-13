import { SetMetadata } from "@nestjs/common";
import { type Role, roleSatisfies } from "@vira/shared";

export const ACCESS_POLICY = "vira:access-policy";

export type AccessPolicy =
  { readonly kind: "public" } | { readonly kind: "role"; readonly role: Role };

/**
 * The authenticated caller, set on the request from a valid access token
 * (authentication.middleware.ts).
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly role: Role;
  /** Session (refresh-token family) the access token was issued from. */
  readonly sessionId: string;
  /**
   * Where the access token came from. Only a cookie is sent by the browser on its own,
   * so only cookie-authenticated requests need a CSRF token (csrf.guard.ts).
   */
  readonly credential: "cookie" | "bearer";
}

declare module "express" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export type AccessDecision = "allow" | "unauthenticated" | "forbidden" | "undeclared";

/** Marks a route (or every route of a controller) as reachable without a session. */
export const Public = (): ClassDecorator & MethodDecorator =>
  SetMetadata(ACCESS_POLICY, { kind: "public" } satisfies AccessPolicy);

/** Requires an authenticated user holding at least `role` (roles are cumulative). */
export const RequireRole = (role: Role): ClassDecorator & MethodDecorator =>
  SetMetadata(ACCESS_POLICY, { kind: "role", role } satisfies AccessPolicy);

/**
 * Deny by default: a route without a declared policy is never served
 * (docs/SECURITY_MODEL.md, OWASP API5). Ownership of individual resources is
 * checked separately, in each module's application layer.
 */
export function decideAccess(
  policy: AccessPolicy | undefined,
  user: Pick<AuthenticatedUser, "role"> | undefined,
): AccessDecision {
  if (!policy) return "undeclared";
  if (policy.kind === "public") return "allow";
  if (!user) return "unauthenticated";
  return roleSatisfies(user.role, policy.role) ? "allow" : "forbidden";
}
