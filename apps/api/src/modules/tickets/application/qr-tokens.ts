import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import {
  type QrClaims,
  type QrSigningKey,
  signQrToken,
  verifyQrToken,
} from "../domain/qr-token.js";
import type { Ticket } from "../domain/ticket.js";

/**
 * Signs the QR token of a ticket with the current key (the first of `QR_SIGNING_KEYS`),
 * and verifies a token read at the door against every key listed, so a rotation does not
 * void the tickets already issued.
 */
@Injectable()
export class QrTokens {
  private readonly signingKey: QrSigningKey;
  private readonly keys: readonly QrSigningKey[];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const [first] = config.tickets.qrSigningKeys;
    if (!first) throw new Error("QR_SIGNING_KEYS has no key");
    this.signingKey = first;
    this.keys = config.tickets.qrSigningKeys;
  }

  tokenFor(ticket: Pick<Ticket, "id" | "qrNonce">): string {
    return signQrToken({ ticketId: ticket.id, nonce: ticket.qrNonce }, this.signingKey);
  }

  /** The ticket and nonce a token names, or `null` when it is not one of ours. */
  verify(token: string): QrClaims | null {
    return verifyQrToken(token, this.keys);
  }
}
