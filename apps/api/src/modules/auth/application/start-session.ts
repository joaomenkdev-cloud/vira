import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "@vira/shared";

import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { AccessTokens } from "../../../platform/security/access-token.js";
import { hashRefreshToken, startSession } from "../domain/session.js";
import { SESSION_REPOSITORY, type SessionRepository } from "./ports/session-repository.js";
import type { SessionCredentials } from "./session-credentials.js";

/**
 * Opens a session for someone who just proved who they are (password login or a
 * verified e-mail link): a new refresh-token family and an access token for it.
 */
@Injectable()
export class StartSession {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly accessTokens: AccessTokens,
  ) {}

  /**
   * @param replacing the refresh token the browser still holds, if any. Its session
   *   ends here: the new cookies overwrite it, so nobody could use it to log out later.
   */
  async execute(
    user: { readonly id: string; readonly role: Role },
    replacing?: string,
  ): Promise<SessionCredentials> {
    const now = this.clock.now();
    if (replacing !== undefined) {
      const previous = await this.sessions.findByTokenHash(hashRefreshToken(replacing));
      if (previous) await this.sessions.revokeFamily(previous.familyId, "LOGOUT", now);
    }

    const { secret, record } = startSession({
      id: this.ids.next(),
      familyId: this.ids.next(),
      userId: user.id,
      now,
    });
    await this.sessions.create(record);

    const access = this.accessTokens.issue({ sub: user.id, role: user.role, sid: record.familyId });
    return {
      sessionId: record.familyId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: secret,
      refreshTokenExpiresAt: record.expiresAt,
    };
  }
}
