import { z } from "zod";

import { TICKET_CODE_PATTERN } from "./tickets.js";

/**
 * Contracts of the check-in (V8, docs/API.md#check-in-checkin). The result of a read is a
 * business answer, always `200` with an explicit `result`; HTTP errors are left for the
 * session, the ownership of the event and a malformed body.
 */

export const CHECKIN_RESULTS = ["VALID", "ALREADY_USED", "WRONG_EVENT", "INVALID"] as const;
export type CheckinResult = (typeof CHECKIN_RESULTS)[number];

export const CHECKIN_METHODS = ["QR", "CODE"] as const;
export type CheckinMethod = (typeof CHECKIN_METHODS)[number];

/** Crockford Base32 reads O as 0 and I or L as 1: what the operator types is forgiven. */
const LOOKALIKES: Record<string, string> = { O: "0", I: "1", L: "1" };

/**
 * A code as the operator typed it, in the canonical `VIRA-XXXX-XXXX`: any case, with or
 * without the prefix, dashes or spaces, and with the letters Crockford confuses with
 * digits. Anything that is not eight symbols long comes back cleaned but unmatched.
 */
export function normalizeTicketCode(input: string): string {
  let symbols = input.toUpperCase().replace(/[\s-]/g, "");
  if (symbols.startsWith("VIRA")) symbols = symbols.slice(4);
  symbols = symbols.replace(/[OIL]/g, (letter) => LOOKALIKES[letter] ?? letter);
  return symbols.length === 8 ? `VIRA-${symbols.slice(0, 4)}-${symbols.slice(4)}` : symbols;
}

export const checkinScanRequestSchema = z
  .strictObject({
    eventId: z.uuid(),
    token: z
      .string()
      .min(1)
      .max(256)
      .meta({ description: "O conteúdo lido do QR Code (`v1.<kid>.<payload>.<sig>`)" }),
  })
  .meta({ id: "CheckinScanRequest" });

export const checkinCodeRequestSchema = z
  .strictObject({
    eventId: z.uuid(),
    code: z
      .string()
      .max(32)
      .overwrite(normalizeTicketCode)
      .regex(TICKET_CODE_PATTERN, "código no formato VIRA-XXXX-XXXX")
      .meta({
        description:
          "O código impresso no ingresso; maiúsculas, traços e o prefixo `VIRA` são opcionais",
        example: "VIRA-7KQ2-M9XD",
      }),
  })
  .meta({ id: "CheckinCodeRequest" });

/** What the door may know of a ticket: no e-mail, no order, nothing of the buyer. */
export const checkinTicketSchema = z
  .strictObject({
    code: z.string().regex(TICKET_CODE_PATTERN),
    holderName: z.string(),
    ticketType: z.string(),
  })
  .meta({ id: "CheckinTicket" });

export const checkinResponseSchema = z
  .strictObject({
    result: z.enum(CHECKIN_RESULTS).meta({
      description:
        "`VALID`: entrada liberada agora. `ALREADY_USED`: o ingresso já entrou (veja `usedAt`). " +
        "`WRONG_EVENT`: ingresso de outro evento. `INVALID`: QR ou código que não vale; com " +
        "`ticket`, é um ingresso cancelado deste evento",
    }),
    ticket: checkinTicketSchema.optional(),
    usedAt: z.string().optional().meta({ description: "Quando entrou, em `ALREADY_USED`" }),
  })
  .meta({ id: "CheckinResponse" });

export const checkinScanSchema = z
  .strictObject({
    result: z.enum(CHECKIN_RESULTS),
    method: z.enum(CHECKIN_METHODS),
    at: z.string(),
    ticket: checkinTicketSchema.optional(),
  })
  .meta({ id: "CheckinScan" });

export const checkinStatsSchema = z
  .strictObject({
    checkedIn: z.number().int().min(0).meta({ description: "Ingressos que já entraram" }),
    total: z.number().int().min(0).meta({ description: "Ingressos válidos ou usados" }),
    lastScans: z.array(checkinScanSchema).max(10).meta({
      description: "As últimas leituras do evento, de qualquer operador, a mais recente primeiro",
    }),
  })
  .meta({ id: "CheckinStats" });

export type CheckinScanRequest = z.infer<typeof checkinScanRequestSchema>;
export type CheckinCodeRequest = z.infer<typeof checkinCodeRequestSchema>;
export type CheckinTicketBody = z.infer<typeof checkinTicketSchema>;
export type CheckinResponseBody = z.infer<typeof checkinResponseSchema>;
export type CheckinScanBody = z.infer<typeof checkinScanSchema>;
export type CheckinStatsBody = z.infer<typeof checkinStatsSchema>;
