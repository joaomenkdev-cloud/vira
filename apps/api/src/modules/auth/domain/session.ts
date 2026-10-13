import { createHash, randomBytes } from "node:crypto";

/**
 * Refresh-token sessions (ADR-0005, docs/DATA_MODEL.md#sessions). A login opens a
 * *family*; every refresh retires the presented token and issues a new one in the same
 * family. The family id is the session id the access token carries (`sid`).
 */

/** A family that is not refreshed for this long ends on its own. */
export const SESSION_IDLE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** No family outlives this, however often it is refreshed. */
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 256 bits from the CSPRNG: unguessable, so a fast hash is enough to store it. */
const TOKEN_BYTES = 32;

export type SessionRevokeReason =
  "LOGOUT" | "REUSE_DETECTED" | "PASSWORD_CHANGED" | "ACCOUNT_DELETED";

/** One refresh token. */
export interface Session {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  /** SHA-256 of the token. The token itself is never stored. */
  readonly tokenHash: Buffer;
  /** When the person logged in: the same for the whole family. */
  readonly authenticatedAt: Date;
  readonly createdAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly expiresAt: Date;
  /** Set when this token was exchanged for the next one. */
  readonly rotatedAt: Date | null;
  readonly revokedAt: Date | null;
}

/** A refresh token as handed to the client, with the row that stores its hash. */
export interface IssuedSession {
  readonly secret: string;
  readonly record: Session;
}

export function hashRefreshToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

function issue(fields: Omit<Session, "tokenHash" | "rotatedAt" | "revokedAt">): IssuedSession {
  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    secret,
    record: Object.freeze({
      ...fields,
      tokenHash: hashRefreshToken(secret),
      rotatedAt: null,
      revokedAt: null,
    }),
  };
}

function idleExpiry(now: Date, absoluteExpiresAt: Date): Date {
  return new Date(Math.min(now.getTime() + SESSION_IDLE_TTL_MS, absoluteExpiresAt.getTime()));
}

/** The first token of a new login. */
export function startSession(input: {
  readonly id: string;
  readonly familyId: string;
  readonly userId: string;
  readonly now: Date;
}): IssuedSession {
  const absoluteExpiresAt = new Date(input.now.getTime() + SESSION_ABSOLUTE_TTL_MS);
  return issue({
    id: input.id,
    userId: input.userId,
    familyId: input.familyId,
    authenticatedAt: input.now,
    createdAt: input.now,
    absoluteExpiresAt,
    expiresAt: idleExpiry(input.now, absoluteExpiresAt),
  });
}

/** The token that replaces `previous`: same family, same login time, same absolute end. */
export function rotateSession(
  previous: Session,
  input: { readonly id: string; readonly now: Date },
): IssuedSession {
  return issue({
    id: input.id,
    userId: previous.userId,
    familyId: previous.familyId,
    authenticatedAt: previous.authenticatedAt,
    createdAt: input.now,
    absoluteExpiresAt: previous.absoluteExpiresAt,
    expiresAt: idleExpiry(input.now, previous.absoluteExpiresAt),
  });
}

export function isExpired(session: Session, now: Date): boolean {
  return session.expiresAt.getTime() <= now.getTime();
}

/** Can still be exchanged for a new token. */
export function isUsable(session: Session, now: Date): boolean {
  return session.rotatedAt === null && session.revokedAt === null && !isExpired(session, now);
}
