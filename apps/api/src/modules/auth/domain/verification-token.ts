import { createHash, randomBytes } from "node:crypto";

export type TokenPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

/** How long each kind of link works (docs/DATA_MODEL.md#verification_tokens). */
export const TOKEN_TTL_MS: Readonly<Record<TokenPurpose, number>> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 30 * 60 * 1000,
};

/** 256 bits from the CSPRNG: unguessable, so a fast hash is enough to store it. */
const TOKEN_BYTES = 32;

export interface VerificationToken {
  readonly id: string;
  readonly userId: string;
  readonly purpose: TokenPurpose;
  /** SHA-256 of the token. The token itself is never stored. */
  readonly tokenHash: Buffer;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export function hashVerificationToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * A new single-use token. `secret` goes into the e-mail and nowhere else; only
 * `record` (with the hash) is stored, so a database leak cannot be turned into links.
 */
export function issueVerificationToken(input: {
  readonly id: string;
  readonly userId: string;
  readonly purpose: TokenPurpose;
  readonly now: Date;
}): { readonly secret: string; readonly record: VerificationToken } {
  const secret = randomBytes(TOKEN_BYTES).toString("base64url");
  return {
    secret,
    record: Object.freeze({
      id: input.id,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: hashVerificationToken(secret),
      expiresAt: new Date(input.now.getTime() + TOKEN_TTL_MS[input.purpose]),
      createdAt: input.now,
    }),
  };
}
