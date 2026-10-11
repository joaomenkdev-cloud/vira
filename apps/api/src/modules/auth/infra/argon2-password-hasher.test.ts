import { performance } from "node:perf_hooks";

import { beforeAll, describe, expect, it } from "vitest";

import { Argon2PasswordHasher } from "./argon2-password-hasher.js";

async function timed(work: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await work();
  return performance.now() - start;
}

describe("Argon2PasswordHasher", () => {
  const hasher = new Argon2PasswordHasher();
  const password = "correct horse battery staple";
  let stored: string;

  beforeAll(async () => {
    stored = await hasher.hash(password);
  });

  it("produces argon2id hashes with the OWASP parameters (19 MiB, t=2, p=1)", () => {
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("salts every hash", async () => {
    expect(await hasher.hash(password)).not.toBe(stored);
  });

  it("accepts the right password and refuses any other", async () => {
    expect(await hasher.verify(stored, password)).toBe(true);
    expect(await hasher.verify(stored, `${password} `)).toBe(false);
    expect(await hasher.verify(stored, "")).toBe(false);
  });

  it("treats a malformed or foreign hash as a failed login, not an error", async () => {
    expect(await hasher.verify("not-a-hash", password)).toBe(false);
    expect(await hasher.verify("$2b$10$abcdefghijklmnopqrstuuxyz", password)).toBe(false);
  });

  it("refuses a missing hash, whatever the password", async () => {
    expect(await hasher.verify(null, password)).toBe(false);
    expect(await hasher.verify(null, "")).toBe(false);
  });

  it("spends the time of a real verification when the hash is missing", async () => {
    await hasher.verify(null, password); // builds the dummy hash outside the measurement
    const real: number[] = [];
    const missing: number[] = [];
    for (let i = 0; i < 3; i++) {
      real.push(await timed(() => hasher.verify(stored, "wrong password")));
      missing.push(await timed(() => hasher.verify(null, "wrong password")));
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[1] ?? 0;

    // Same order of magnitude: both run a full argon2id (tens of milliseconds), where a
    // shortcut would answer in well under a millisecond.
    expect(median(missing)).toBeGreaterThan(median(real) * 0.4);
    expect(median(missing)).toBeLessThan(median(real) * 2.5);
  });
});
