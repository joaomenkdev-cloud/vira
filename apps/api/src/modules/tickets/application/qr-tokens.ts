import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { type QrSigningKey, signQrToken } from "../domain/qr-token.js";
import type { Ticket } from "../domain/ticket.js";

/** Signs the QR token of a ticket with the current key (the first of `QR_SIGNING_KEYS`). */
@Injectable()
export class QrTokens {
  private readonly signingKey: QrSigningKey;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const [first] = config.tickets.qrSigningKeys;
    if (!first) throw new Error("QR_SIGNING_KEYS has no key");
    this.signingKey = first;
  }

  tokenFor(ticket: Pick<Ticket, "id" | "qrNonce">): string {
    return signQrToken({ ticketId: ticket.id, nonce: ticket.qrNonce }, this.signingKey);
  }
}
