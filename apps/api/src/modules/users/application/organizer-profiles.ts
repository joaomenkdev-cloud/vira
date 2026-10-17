import { Inject, Injectable } from "@nestjs/common";

import { ACCOUNT_REPOSITORY, type AccountRepository } from "./ports/account-repository.js";

/**
 * What other modules may ask about organizer profiles (the `events` module, to know
 * whose events the caller manages). Only by the id in the session.
 */
@Injectable()
export class OrganizerProfiles {
  constructor(@Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository) {}

  /** The id of the caller's organizer profile, or `null` when they have none. */
  async profileIdOf(userId: string): Promise<string | null> {
    return this.accounts.findOrganizerProfileId(userId);
  }
}
