import { describe, expect, it } from "vitest";

import {
  hashRefreshToken,
  isUsable,
  rotateSession,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  startSession,
} from "./session.js";

const DAY = 24 * 60 * 60 * 1000;
const login = new Date("2026-10-13T12:00:00Z");
const at = (ms: number) => new Date(login.getTime() + ms);

function start() {
  return startSession({ id: "s1", familyId: "f1", userId: "u1", now: login });
}

describe("refresh-token sessions", () => {
  it("issues 256-bit tokens and stores only their SHA-256", () => {
    const { secret, record } = start();
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(record.tokenHash).toEqual(hashRefreshToken(secret));
    expect(JSON.stringify(record)).not.toContain(secret);
    expect(start().secret).not.toBe(secret);
  });

  it("expires after seven idle days, and never later than thirty days after the login", () => {
    const first = start().record;
    expect(first.expiresAt).toEqual(at(SESSION_IDLE_TTL_MS));
    expect(first.absoluteExpiresAt).toEqual(at(SESSION_ABSOLUTE_TTL_MS));

    const later = rotateSession(first, { id: "s2", now: at(6 * DAY) }).record;
    expect(later.expiresAt).toEqual(at(13 * DAY));

    const nearTheEnd = rotateSession(first, { id: "s3", now: at(28 * DAY) }).record;
    expect(nearTheEnd.expiresAt).toEqual(at(30 * DAY));
  });

  it("keeps the family, the owner and the login time across rotations", () => {
    const first = start().record;
    const next = rotateSession(first, { id: "s2", now: at(DAY) });
    expect(next.record).toMatchObject({
      id: "s2",
      familyId: "f1",
      userId: "u1",
      authenticatedAt: login,
      createdAt: at(DAY),
      rotatedAt: null,
      revokedAt: null,
    });
    expect(next.record.tokenHash).not.toEqual(first.tokenHash);
  });

  it("is usable only while neither rotated, revoked nor expired", () => {
    const session = start().record;
    expect(isUsable(session, login)).toBe(true);
    expect(isUsable(session, session.expiresAt)).toBe(false);
    expect(isUsable({ ...session, rotatedAt: login }, login)).toBe(false);
    expect(isUsable({ ...session, revokedAt: login }, login)).toBe(false);
  });
});
