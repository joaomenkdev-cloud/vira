import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { hash, type Options, verify } from "@node-rs/argon2";

import type { PasswordHasher } from "../application/ports/password-hasher.js";

/**
 * OWASP's argon2id minimum for passwords: 19 MiB of memory, 2 passes, 1 lane
 * (ADR-0005). The algorithm is left at the library default, argon2id; the tests
 * check that the produced hashes say so.
 */
const ARGON2_OPTIONS: Options = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(storedHash: string | null, password: string): Promise<boolean> {
    // Without a real hash, spend the time of a real verification anyway.
    const target = storedHash ?? (await this.getDummyHash());
    let matches: boolean;
    try {
      matches = await verify(target, password);
    } catch {
      // A malformed stored hash is a failed login, not a server error.
      return false;
    }
    return storedHash !== null && matches;
  }

  /** Hashed once, with the parameters above, from a random value nobody knows. */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash(randomBytes(32).toString("base64url"), ARGON2_OPTIONS);
    return this.dummyHash;
  }
}
