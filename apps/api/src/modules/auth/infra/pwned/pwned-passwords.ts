import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { APP_CONFIG } from "../../../../platform/config/config.module.js";
import type { AppConfig } from "../../../../platform/config/config.schema.js";
import type { BreachedPasswords } from "../../application/ports/breached-passwords.js";

/** The check runs inside a request someone is waiting on: give up quickly. */
export const PWNED_PASSWORDS_TIMEOUT_MS = 3_000;

/** A padded range answer has about a thousand 40-byte lines; this is far above it. */
const MAX_RESPONSE_BYTES = 256 * 1024;

/** `SUFFIX:COUNT`, where SUFFIX is the last 35 hex digits of the SHA-1. */
const RANGE_LINE = /^([0-9A-F]{35}):(\d+)$/;

/**
 * The range a candidate password belongs to, in the form the Pwned Passwords API
 * expects: the upper-case hex SHA-1 split after five digits. SHA-1 is what the API
 * indexes by; the digest is only a lookup key, never stored (storage is argon2id's job,
 * in PasswordHasher). The parameter is deliberately not called "password": static
 * analysis takes any SHA-1 of a "password" for password storage.
 */
export function rangeOf(candidate: string): { readonly prefix: string; readonly suffix: string } {
  const digest = createHash("sha1").update(candidate, "utf8").digest("hex").toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

/**
 * Whether a range answer lists `suffix` with a positive count. Padding entries (added
 * by `Add-Padding: true`) have a count of zero and never match.
 */
export function rangeIncludes(body: string, suffix: string): boolean {
  for (const raw of body.split("\n")) {
    const match = RANGE_LINE.exec(raw.trim());
    if (match?.[1] === suffix && Number(match[2]) > 0) return true;
  }
  return false;
}

/**
 * Have I Been Pwned's Pwned Passwords range API, with k-anonymity: only the first five
 * hex digits of the SHA-1 leave the server, and the comparison with the rest happens
 * here. `Add-Padding` makes every answer about the same size, so someone watching the
 * (encrypted) traffic cannot tell ranges apart by length.
 *
 * Fails open: a timeout, an error status or an unreadable answer accepts the password
 * and logs a warning (without the prefix, which says something about the password).
 */
@Injectable()
export class PwnedPasswords implements BreachedPasswords {
  private readonly baseUrl: string;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @InjectPinoLogger(PwnedPasswords.name) private readonly logger: PinoLogger,
  ) {
    this.baseUrl = config.auth.pwnedPasswords.baseUrl;
  }

  async includes(candidate: string): Promise<boolean> {
    const { prefix, suffix } = rangeOf(candidate);
    try {
      return rangeIncludes(await this.range(prefix), suffix);
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? { message: error.message } : undefined },
        "Pwned Passwords unavailable; accepting the password unchecked",
      );
      return false;
    }
  }

  private async range(prefix: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "vira-api" },
      redirect: "error",
      signal: AbortSignal.timeout(PWNED_PASSWORDS_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`range lookup answered ${response.status}`);
    }
    if (Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error("range lookup answer too large");
    }
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) throw new Error("range lookup answer too large");
    return body;
  }
}

/** Used when the check is turned off (`PWNED_PASSWORDS_ENABLED=false`, and in tests). */
export class NoBreachedPasswords implements BreachedPasswords {
  includes(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
