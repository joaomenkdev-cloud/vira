import { Inject, Injectable } from "@nestjs/common";
import type { Role } from "@vira/shared";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { AuditLog } from "../../audit/application/public-api.js";
import { SessionNotFoundError } from "./errors.js";
import { SESSION_REPOSITORY, type SessionRepository } from "./ports/session-repository.js";
import { type RequestContext, withRequestId } from "./request-context.js";

/** The caller, as the access token describes them. */
export interface SessionOwner {
  readonly id: string;
  readonly role: Role;
  readonly sessionId: string;
}

/**
 * Logging out. Revoking a family stops its refresh token at once; an access token
 * already issued from it keeps working until it expires (at most ten minutes, ADR-0005).
 */
@Injectable()
export class EndSession {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  /** Ends the session the caller is using. */
  async current(owner: SessionOwner): Promise<void> {
    await this.sessions.revokeFamily(owner.sessionId, "LOGOUT", this.clock.now());
  }

  /** Ends every session of the caller, on every device. */
  async all(owner: SessionOwner, context: RequestContext = {}): Promise<void> {
    const revokedSessions = await this.sessions.revokeAllOf(owner.id, "LOGOUT", this.clock.now());
    await this.audit.record(
      { action: "auth.logout_all", entityId: owner.id, metadata: { revokedSessions } },
      { actor: { id: owner.id, role: owner.role }, ...withRequestId(context) },
    );
  }

  /**
   * Ends one of the caller's sessions, e.g. a device they no longer have.
   * @throws SessionNotFoundError when no active session with that id is theirs.
   */
  async one(owner: SessionOwner, sessionId: string, context: RequestContext = {}): Promise<void> {
    const revoked = await this.sessions.revokeActiveFamilyOf(
      owner.id,
      sessionId,
      "LOGOUT",
      this.clock.now(),
    );
    if (!revoked) throw new SessionNotFoundError();
    await this.audit.record(
      { action: "auth.session_revoked", entityId: sessionId, metadata: {} },
      { actor: { id: owner.id, role: owner.role }, ...withRequestId(context) },
    );
  }
}
