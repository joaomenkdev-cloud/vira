import { Injectable } from "@nestjs/common";
import type { Role } from "@vira/shared";

import { OrganizerProfiles } from "../../users/application/public-api.js";
import { NotOrganizerError } from "./errors.js";

/** The caller, as the access token describes them. */
export interface Caller {
  readonly id: string;
  readonly role: Role;
}

export interface RequestContext {
  readonly requestId?: string;
}

/**
 * Whose events the caller manages: those of their own organizer profile, and only
 * those. Every use case starts here, so no event is ever looked up without its owner.
 */
@Injectable()
export class OrganizerScope {
  constructor(private readonly profiles: OrganizerProfiles) {}

  /** @throws NotOrganizerError when the caller has no organizer profile. */
  async organizerIdOf(caller: Caller): Promise<string> {
    const organizerId = await this.profiles.profileIdOf(caller.id);
    if (!organizerId) throw new NotOrganizerError();
    return organizerId;
  }
}

/** The random tail of a fresh UUIDv7, used as a slug suffix. */
export function slugSuffix(freshId: string): string {
  return freshId.replaceAll("-", "").slice(-6);
}

export function auditContext(caller: Caller, context: RequestContext) {
  return {
    actor: { id: caller.id, role: caller.role },
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
  };
}
