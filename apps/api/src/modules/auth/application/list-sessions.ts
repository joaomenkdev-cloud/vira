import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { hashRefreshToken, isUsable } from "../domain/session.js";
import {
  type ActiveSession,
  SESSION_REPOSITORY,
  type SessionRepository,
} from "./ports/session-repository.js";

export interface SessionView extends ActiveSession {
  /** The session this request was made with. */
  readonly current: boolean;
}

/** Reading sessions: the caller's active logins, and whose session a refresh token is. */
@Injectable()
export class ListSessions {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string, currentSessionId: string): Promise<SessionView[]> {
    const active = await this.sessions.listActive(userId, this.clock.now());
    return active.map((session) => ({ ...session, current: session.id === currentSessionId }));
  }

  /** The session id behind a refresh token that can still be used, or `null`. */
  async idOf(refreshToken: string): Promise<string | null> {
    const session = await this.sessions.findByTokenHash(hashRefreshToken(refreshToken));
    return session && isUsable(session, this.clock.now()) ? session.familyId : null;
  }
}
