/** User roles, from least to most privileged. Roles are cumulative (ADR-0005). */
export const ROLES = ["BUYER", "ORGANIZER", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

/** Whether a user holding `held` may act with the privileges of `required`. */
export function roleSatisfies(held: Role, required: Role): boolean {
  return ROLES.indexOf(held) >= ROLES.indexOf(required);
}
