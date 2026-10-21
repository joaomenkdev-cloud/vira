import { createHmac, timingSafeEqual } from "node:crypto";

/** A key that signs or verifies QR tokens; `kid` names it inside the token. */
export interface QrSigningKey {
  readonly kid: string;
  readonly key: Buffer;
}

/** What a valid token says: the ticket and the nonce it was issued with. */
export interface QrClaims {
  readonly ticketId: string;
  readonly nonce: Buffer;
}

const VERSION = "v1";
const NONCE_BYTES = 16;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** base64url of 32 bytes (16 of the ticket id, 16 of the nonce) and of an HMAC-SHA256. */
const TOKEN_PATTERN = /^v1\.([a-z0-9]{1,16})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/;

function uuidBytes(id: string): Buffer {
  const hex = id.toLowerCase().replace(/-/g, "");
  if (!UUID_PATTERN.test(id.toLowerCase())) throw new Error("not a UUID");
  return Buffer.from(hex, "hex");
}

function uuidOf(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mac(key: Buffer, signed: string): Buffer {
  return createHmac("sha256", key).update(signed).digest();
}

/**
 * The QR token of a ticket (ADR-0008): `v1.<kid>.<payload>.<sig>`, where `payload` is
 * base64url(ticketId ‖ nonce) and `sig` the HMAC-SHA256 of `v1.<kid>.<payload>`. The same
 * ticket, nonce and key always give the same token.
 */
export function signQrToken(claims: QrClaims, signingKey: QrSigningKey): string {
  if (claims.nonce.length !== NONCE_BYTES) throw new Error("QR nonce must have 16 bytes");
  const payload = Buffer.concat([uuidBytes(claims.ticketId), claims.nonce]).toString("base64url");
  const signed = `${VERSION}.${signingKey.kid}.${payload}`;
  return `${signed}.${mac(signingKey.key, signed).toString("base64url")}`;
}

/**
 * The claims of a token one of `keys` signed, or `null` for anything else: a bad format,
 * an unknown `kid` or a signature that does not match (compared in constant time). Nothing
 * here touches the database, so garbage is refused cheaply.
 */
export function verifyQrToken(token: string, keys: readonly QrSigningKey[]): QrClaims | null {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const [, kid, payload, signature] = match as unknown as [string, string, string, string];
  const signingKey = keys.find((k) => k.kid === kid);
  if (!signingKey) return null;
  const expected = mac(signingKey.key, `${VERSION}.${kid}.${payload}`);
  // Only the canonical encoding: the unused low bits of the last character must be zero,
  // so a token has exactly one spelling.
  const given = Buffer.from(signature, "base64url");
  if (given.toString("base64url") !== signature) return null;
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const bytes = Buffer.from(payload, "base64url");
  if (bytes.length !== 16 + NONCE_BYTES || bytes.toString("base64url") !== payload) return null;
  return { ticketId: uuidOf(bytes.subarray(0, 16)), nonce: bytes.subarray(16) };
}
