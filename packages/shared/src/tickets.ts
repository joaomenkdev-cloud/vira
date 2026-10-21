import { z } from "zod";

import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX, pageSchema } from "./events.js";

/**
 * Contracts of tickets (V5, docs/API.md#ingressos-tickets). A ticket is issued for each
 * unit of a paid order. Only its owner sees it, and only the single-ticket view carries
 * the QR token (ADR-0008): never a list, a log or a URL.
 */

export const TICKET_STATUSES = ["VALID", "USED", "CANCELED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** `VIRA-XXXX-XXXX` in Crockford Base32: the readable reference of a ticket. */
export const TICKET_CODE_PATTERN = /^VIRA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export const TICKET_LIST_WHEN = ["upcoming", "past"] as const;

export const listTicketsQuerySchema = z
  .strictObject({
    when: z.enum(TICKET_LIST_WHEN).default("upcoming").meta({
      description:
        "`upcoming`: eventos que ainda não terminaram, os mais próximos primeiro; `past`: os que já terminaram, os mais recentes primeiro",
    }),
    limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
    cursor: z.string().max(512).optional(),
  })
  .meta({ id: "ListTicketsQuery" });

export const ticketEventSchema = z
  .strictObject({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    timezone: z.string(),
    // Always set on a published event; nullable like the event's own columns.
    venueName: z.string().nullable(),
    venueCity: z.string().nullable(),
    venueState: z.string().nullable(),
  })
  .meta({ id: "TicketEvent" });

const ticketFields = {
  id: z.uuid(),
  code: z.string().regex(TICKET_CODE_PATTERN).meta({ example: "VIRA-7KQ2-M9XD" }),
  status: z.enum(TICKET_STATUSES),
  holderName: z.string(),
  ticketType: z.strictObject({ name: z.string() }),
  event: ticketEventSchema,
  orderId: z.uuid(),
  issuedAt: z.string(),
  usedAt: z.string().nullable(),
};

export const ticketSummarySchema = z.strictObject(ticketFields).meta({ id: "TicketSummary" });

export const ticketListSchema = z
  .strictObject({ data: z.array(ticketSummarySchema), page: pageSchema })
  .meta({ id: "TicketList" });

export const ticketSchema = z
  .strictObject({
    ...ticketFields,
    qrToken: z.string().meta({
      description:
        "Conteúdo do QR Code (`v1.<kid>.<payload>.<sig>`, ADR-0008). Só para o dono; não guarde nem compartilhe",
    }),
  })
  .meta({ id: "Ticket" });

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type TicketEventBody = z.infer<typeof ticketEventSchema>;
export type TicketSummaryBody = z.infer<typeof ticketSummarySchema>;
export type TicketListBody = z.infer<typeof ticketListSchema>;
export type TicketBody = z.infer<typeof ticketSchema>;
