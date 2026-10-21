import { describe, expect, it } from "vitest";

import { type QrSigningKey, signQrToken, verifyQrToken } from "./qr-token.js";
import { newTicketCode } from "./ticket-code.js";

const ticketId = "0192a0e4-4444-7000-8000-00000000abcd";
const nonce = Buffer.alloc(16, 7);
const current: QrSigningKey = { kid: "k2", key: Buffer.alloc(32, 2) };
const previous: QrSigningKey = { kid: "k1", key: Buffer.alloc(32, 1) };

describe("QR tokens", () => {
  it("signs with the given key and verifies with any listed key", () => {
    const token = signQrToken({ ticketId, nonce }, current);
    expect(token).toMatch(/^v1\.k2\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/);
    expect(signQrToken({ ticketId, nonce }, current)).toBe(token);
    expect(verifyQrToken(token, [current, previous])).toEqual({ ticketId, nonce });

    // A ticket signed before the rotation still verifies while the old key is listed.
    const old = signQrToken({ ticketId, nonce }, previous);
    expect(verifyQrToken(old, [current, previous])).toEqual({ ticketId, nonce });
    expect(verifyQrToken(old, [current])).toBeNull();
  });

  it("refuses a token changed in any single character", () => {
    const token = signQrToken({ ticketId, nonce }, current);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
    for (let i = 0; i < token.length; i++) {
      for (const char of alphabet) {
        if (char === token[i]) continue;
        const changed = token.slice(0, i) + char + token.slice(i + 1);
        expect(verifyQrToken(changed, [current, previous])).toBeNull();
      }
    }
  });

  it("refuses another key under the same kid, an unknown kid and malformed tokens", () => {
    const token = signQrToken({ ticketId, nonce }, current);
    expect(verifyQrToken(token, [{ kid: "k2", key: Buffer.alloc(32, 9) }])).toBeNull();
    expect(verifyQrToken(token.replace("v1.k2.", "v1.k3."), [current])).toBeNull();
    for (const garbage of ["", "v1", "v2.k2.a.b", `${token}.`, ` ${token}`, token.toUpperCase()]) {
      expect(verifyQrToken(garbage, [current])).toBeNull();
    }
  });

  it("gives another token for another nonce, which voids the old one", () => {
    const first = signQrToken({ ticketId, nonce }, current);
    const second = signQrToken({ ticketId, nonce: Buffer.alloc(16, 8) }, current);
    expect(second).not.toBe(first);
    expect(verifyQrToken(first, [current])?.nonce).toEqual(nonce);
  });
});

describe("ticket codes", () => {
  it("are VIRA-XXXX-XXXX in Crockford Base32, and random", () => {
    const codes = new Set(Array.from({ length: 200 }, newTicketCode));
    for (const code of codes)
      expect(code).toMatch(/^VIRA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(codes.size).toBe(200);
  });
});
