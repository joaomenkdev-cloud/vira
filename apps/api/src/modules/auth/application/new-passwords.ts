import { Inject, Injectable } from "@nestjs/common";

import { BreachedPasswordError } from "./errors.js";
import { BREACHED_PASSWORDS, type BreachedPasswords } from "./ports/breached-passwords.js";
import { PASSWORD_HASHER, type PasswordHasher } from "./ports/password-hasher.js";

/**
 * The policy every new password goes through (sign-up, reset and change, ADR-0005):
 * the length rules are in the request schema; here the password must also be absent
 * from known breaches before it is hashed.
 */
@Injectable()
export class NewPasswords {
  constructor(
    @Inject(BREACHED_PASSWORDS) private readonly breached: BreachedPasswords,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
  ) {}

  /**
   * The argon2id hash of an acceptable new password.
   * @throws BreachedPasswordError when the password appears in known breaches.
   */
  async hash(password: string): Promise<string> {
    if (await this.breached.includes(password)) throw new BreachedPasswordError();
    return this.hasher.hash(password);
  }
}
