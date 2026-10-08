import { SetMetadata } from "@nestjs/common";
import { type Role, roleSatisfies } from "@vira/shared";

export const ACCESS_POLICY = "vira:access-policy";

export type AccessPolicy =
  { readonly kind: "public" } | { readonly kind: "role"; readonly role: Role };

/** The authenticated caller, set on the request by the auth module. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly role: Role;
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
  user: AuthenticatedUser | undefined,
): AccessDecision {
  if (!policy) return "undeclared";
  if (policy.kind === "public") return "allow";
  if (!user) return "unauthenticated";
  return roleSatisfies(user.role, policy.role) ? "allow" : "forbidden";
}
