import type { Role } from "@vira/shared";

/**
 * A person's own account, as the `users` module sees it (docs/DATA_MODEL.md#users,
 * #organizer_profiles). The credentials (password, e-mail changes, lockout) belong to
 * the `auth` module; here they only show as `hasPassword` and `emailVerified`.
 */
export interface Account {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly emailVerified: boolean;
  readonly hasPassword: boolean;
  readonly organizer: OrganizerProfile | null;
}

export interface OrganizerProfile {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly slug: string;
  readonly createdAt: Date;
}
