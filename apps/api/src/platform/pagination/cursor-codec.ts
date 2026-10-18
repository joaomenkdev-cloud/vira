import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";

/** A position in a list: the sort key (as text) and the id that breaks ties. */
export interface CursorPosition {
  readonly key: string;
  readonly id: string;
}

const MAC_BYTES = 16;

/**
 * Opaque pagination cursors (docs/API.md#paginação-por-cursor): base64url of the position,
 * then an HMAC over it and the list's scope. A cursor cannot be forged or edited, nor
 * carried over to another list (another organizer's, another filter): the scope differs.
 * The key is derived from `CSRF_SECRET` with HKDF under its own label.
 */
@Injectable()
export class CursorCodec {
  private readonly key: Buffer;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = Buffer.from(
      hkdfSync("sha256", config.auth.csrfSecret, "", "vira pagination cursor", 32),
    );
  }

  encode(scope: string, position: CursorPosition): string {
    const payload = Buffer.from(JSON.stringify([position.key, position.id])).toString("base64url");
    return `${payload}.${this.mac(scope, payload).toString("base64url")}`;
  }

  /** The position, or `null` for anything this codec did not issue for `scope`. */
  decode(scope: string, cursor: string): CursorPosition | null {
    const [payload, mac, ...rest] = cursor.split(".");
    if (!payload || !mac || rest.length > 0) return null;
    const given = Buffer.from(mac, "base64url");
    const expected = this.mac(scope, payload);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "string" &&
        typeof value[1] === "string"
      ) {
        return { key: value[0], id: value[1] };
      }
    } catch {
      // Not JSON: cannot happen with a valid MAC, but never trust it blindly.
    }
    return null;
  }

  private mac(scope: string, payload: string): Buffer {
    return createHmac("sha256", this.key)
      .update(scope)
      .update("\0")
      .update(payload)
      .digest()
      .subarray(0, MAC_BYTES);
  }
}
