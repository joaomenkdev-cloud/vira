import { beforeEach, describe, expect, it } from "vitest";

import type { AppConfig } from "../../../platform/config/config.schema.js";
import { AccessTokens } from "../../../platform/security/access-token.js";
import { SESSION_IDLE_TTL_MS } from "../domain/session.js";
import { newUser, type User } from "../domain/user.js";
import { EndSession } from "./end-session.js";
import { InvalidSessionError, SessionNotFoundError } from "./errors.js";
import {
  createRecorders,
  FakeClock,
  FakeIds,
  FakeTransactions,
  InMemorySessionRepository,
  InMemoryUserRepository,
} from "./in-memory.fakes.js";
import { ListSessions } from "./list-sessions.js";
import { RefreshSession } from "./refresh-session.js";
import { StartSession } from "./start-session.js";

function setup() {
  const clock = new FakeClock();
  const ids = new FakeIds();
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const recorders = createRecorders(clock, ids);
  const accessTokens = new AccessTokens(
    { auth: { jwtSecret: "k".repeat(43) } } as AppConfig,
    clock,
  );

  const start = new StartSession(sessions, clock, ids, accessTokens);
  const refresh = new RefreshSession(
    sessions,
    users,
    new FakeTransactions(),
    clock,
    ids,
    accessTokens,
    recorders.audit,
  );
  const end = new EndSession(sessions, clock, recorders.audit);
  const list = new ListSessions(sessions, clock);

  async function verifiedUser(email = "ana@exemplo.com"): Promise<User> {
    const user = {
      ...newUser({
        id: ids.next(),
        name: "Ana",
        email,
        passwordHash: "$argon2id$x",
        now: clock.current,
      }),
      emailVerifiedAt: clock.current,
    };
    await users.create(user);
    return user;
  }

  return {
    clock,
    users,
    sessions,
    accessTokens,
    start,
    refresh,
    end,
    list,
    verifiedUser,
    ...recorders,
  };
}

describe("sessions", () => {
  let s: ReturnType<typeof setup>;
  let user: User;
  beforeEach(async () => {
    s = setup();
    user = await s.verifiedUser();
  });

  describe("StartSession", () => {
    it("opens a family and an access token that names it", async () => {
      const credentials = await s.start.execute(user);

      const [row] = s.sessions.rows;
      expect(row?.familyId).toBe(credentials.sessionId);
      expect(s.accessTokens.verify(credentials.accessToken)).toEqual({
        sub: user.id,
        role: "BUYER",
        sid: credentials.sessionId,
      });
      expect(credentials.refreshTokenExpiresAt).toEqual(
        new Date(s.clock.current.getTime() + SESSION_IDLE_TTL_MS),
      );
    });

    it("ends the session whose refresh token the browser is replacing", async () => {
      const previous = await s.start.execute(user);
      const next = await s.start.execute(user, previous.refreshToken);

      expect(s.sessions.family(previous.sessionId).every((r) => r.revokedAt !== null)).toBe(true);
      expect(s.sessions.family(next.sessionId).every((r) => r.revokedAt === null)).toBe(true);
    });
  });

  describe("RefreshSession", () => {
    it("rotates: the new token works once, the old one is retired, the family is kept", async () => {
      const first = await s.start.execute(user);
      s.clock.advance(60_000);
      const second = await s.refresh.execute(first.refreshToken);

      expect(second.sessionId).toBe(first.sessionId);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(s.accessTokens.verify(second.accessToken)?.sid).toBe(first.sessionId);
      expect(s.sessions.family(first.sessionId).map((r) => r.rotatedAt !== null)).toEqual([
        true,
        false,
      ]);
      await expect(s.refresh.execute(second.refreshToken)).resolves.toBeDefined();
    });

    it("revokes the whole family when a rotated token comes back, and audits it", async () => {
      const first = await s.start.execute(user);
      const second = await s.refresh.execute(first.refreshToken);

      await expect(s.refresh.execute(first.refreshToken)).rejects.toBeInstanceOf(
        InvalidSessionError,
      );
      // The legitimate holder of the newest token is logged out too.
      await expect(s.refresh.execute(second.refreshToken)).rejects.toBeInstanceOf(
        InvalidSessionError,
      );
      const family = s.sessions.family(first.sessionId);
      expect(family.every((row) => row.revokedAt !== null)).toBe(true);
      expect(family.map((row) => s.sessions.revokeReasons.get(row.id))).toEqual([
        "REUSE_DETECTED",
        "REUSE_DETECTED",
      ]);
      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.refresh_reuse_detected",
          entityType: "session",
          entityId: first.sessionId,
          actorId: null,
          metadata: { revokedSessions: 2 },
        }),
      ]);
    });

    it("treats losing a race for the same token as reuse", async () => {
      const first = await s.start.execute(user);
      s.sessions.beforeRotate = () => {
        const row = s.sessions.rows[0];
        if (row) row.rotatedAt = s.clock.current;
      };

      await expect(s.refresh.execute(first.refreshToken)).rejects.toBeInstanceOf(
        InvalidSessionError,
      );
      expect(s.sessions.rows).toHaveLength(1);
      expect(s.sessions.rows[0]?.revokedAt).not.toBeNull();
    });

    it("refuses unknown, expired and revoked tokens without revoking anything else", async () => {
      const first = await s.start.execute(user);
      await expect(s.refresh.execute("unknown")).rejects.toBeInstanceOf(InvalidSessionError);

      s.clock.advance(SESSION_IDLE_TTL_MS);
      await expect(s.refresh.execute(first.refreshToken)).rejects.toBeInstanceOf(
        InvalidSessionError,
      );
      expect(s.sessions.rows[0]?.revokedAt).toBeNull();

      const other = await s.start.execute(user);
      await s.end.current({ ...user, sessionId: other.sessionId });
      await expect(s.refresh.execute(other.refreshToken)).rejects.toBeInstanceOf(
        InvalidSessionError,
      );
      expect(s.auditEntries).toEqual([]);
    });

    it("reads the role again, so a promotion reaches the next access token", async () => {
      const first = await s.start.execute(user);
      s.users.users.set(user.id, { ...user, role: "ORGANIZER" });

      const next = await s.refresh.execute(first.refreshToken);
      expect(s.accessTokens.verify(next.accessToken)?.role).toBe("ORGANIZER");
    });

    it("refuses to refresh a session whose account is gone", async () => {
      const first = await s.start.execute(user);
      s.users.users.delete(user.id);
      await expect(s.refresh.execute(first.refreshToken)).rejects.toBeInstanceOf(
        InvalidSessionError,
      );
    });
  });

  describe("EndSession and ListSessions", () => {
    it("logout revokes only the current session", async () => {
      const phone = await s.start.execute(user);
      const laptop = await s.start.execute(user);

      await s.end.current({ ...user, sessionId: laptop.sessionId });

      expect((await s.list.execute(user.id, phone.sessionId)).map((x) => x.id)).toEqual([
        phone.sessionId,
      ]);
      expect(s.sessions.revokeReasons.get(s.sessions.family(laptop.sessionId)[0]?.id ?? "")).toBe(
        "LOGOUT",
      );
    });

    it("logout-all revokes every session of the account and audits how many", async () => {
      const other = await s.verifiedUser("bia@exemplo.com");
      const a = await s.start.execute(user);
      await s.start.execute(user);
      const theirs = await s.start.execute(other);
      await s.refresh.execute(a.refreshToken);

      await s.end.all({ ...user, sessionId: a.sessionId });

      expect(await s.list.execute(user.id, a.sessionId)).toEqual([]);
      expect(await s.list.execute(other.id, theirs.sessionId)).toHaveLength(1);
      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.logout_all",
          entityId: user.id,
          actorId: user.id,
          metadata: { revokedSessions: 2 },
        }),
      ]);
    });

    it("lists active sessions, newest login first, marking the current one", async () => {
      const first = await s.start.execute(user);
      s.clock.advance(1000);
      const second = await s.start.execute(user);
      s.clock.advance(1000);
      await s.refresh.execute(first.refreshToken);

      const listed = await s.list.execute(user.id, first.sessionId);
      expect(listed).toEqual([
        expect.objectContaining({ id: second.sessionId, current: false }),
        expect.objectContaining({
          id: first.sessionId,
          current: true,
          lastRefreshedAt: s.clock.current,
        }),
      ]);
    });

    it("revokes one session by id, but only the caller's own and only once", async () => {
      const other = await s.verifiedUser("bia@exemplo.com");
      const mine = await s.start.execute(user);
      const theirs = await s.start.execute(other);
      const owner = { ...user, sessionId: mine.sessionId };

      await expect(s.end.one(owner, theirs.sessionId)).rejects.toBeInstanceOf(SessionNotFoundError);
      expect(await s.list.execute(other.id, theirs.sessionId)).toHaveLength(1);

      await s.end.one(owner, mine.sessionId);
      await expect(s.end.one(owner, mine.sessionId)).rejects.toBeInstanceOf(SessionNotFoundError);
      expect(s.auditEntries).toEqual([
        expect.objectContaining({
          action: "auth.session_revoked",
          entityType: "session",
          entityId: mine.sessionId,
          actorId: user.id,
        }),
      ]);
    });

    it("tells whose session a usable refresh token is, and nothing for any other", async () => {
      const first = await s.start.execute(user);
      expect(await s.list.idOf(first.refreshToken)).toBe(first.sessionId);
      await s.refresh.execute(first.refreshToken);
      expect(await s.list.idOf(first.refreshToken)).toBeNull();
      expect(await s.list.idOf("unknown")).toBeNull();
    });
  });
});
