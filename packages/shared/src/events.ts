import { z } from "zod";

/**
 * Contracts of the organizer's event routes (N8, docs/API.md#eventos-do-organizador-events).
 * Request schemas are strict like every other: `status`, `organizerId`, `descriptionHtml`,
 * `sold` or any field a route does not take is a `400`, never silently applied (OWASP
 * API3, mass assignment). Status changes have routes of their own (publish, cancel).
 */

export const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "CANCELED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_TITLE_MIN_LENGTH = 3;
export const EVENT_TITLE_MAX_LENGTH = 120;
export const EVENT_DESCRIPTION_MAX_LENGTH = 20_000;
export const CANCEL_REASON_MAX_LENGTH = 500;
export const TICKET_TYPE_NAME_MAX_LENGTH = 80;
export const TICKET_TYPE_DESCRIPTION_MAX_LENGTH = 500;
/** Paid tickets only in the MVP: at least R$ 1,00 (free events are in Marco 3). */
export const TICKET_PRICE_MIN_CENTS = 100;
/** R$ 100.000,00: far above any real ticket, low enough to keep totals in an int. */
export const TICKET_PRICE_MAX_CENTS = 10_000_000;
export const TICKET_CAPACITY_MAX = 100_000;
export const MAX_PER_ORDER_LIMIT = 20;
export const MAX_PER_ORDER_DEFAULT = 10;
export const PAGE_LIMIT_MAX = 50;
export const PAGE_LIMIT_DEFAULT = 20;

/** Picture formats the upload takes; the server re-encodes every one of them to WebP. */
export const EVENT_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type EventImageContentType = (typeof EVENT_IMAGE_CONTENT_TYPES)[number];
/** 5 MB (docs/DATA_MODEL.md#media_uploads). */
export const EVENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Smallest picture that still fills the event banner on a wide screen. */
export const EVENT_IMAGE_MIN_WIDTH = 1200;
export const EVENT_IMAGE_MIN_HEIGHT = 600;
export const EVENT_IMAGE_ALT_MAX_LENGTH = 300;

/** The 26 states and the Distrito Federal. */
export const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const; // prettier-ignore

let knownTimeZones: ReadonlySet<string> | undefined;

/** IANA zone names the runtime knows (`America/Sao_Paulo`), as docs/DATA_MODEL.md asks. */
export function isKnownTimeZone(zone: string): boolean {
  knownTimeZones ??= new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);
  return knownTimeZones.has(zone);
}

const dateTimeSchema = z.iso
  .datetime({ offset: true })
  .meta({ description: "Data e hora ISO 8601", example: "2026-12-05T22:00:00Z" });

const optionalText = (max: number) => z.string().trim().min(1).max(max);

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine(isKnownTimeZone, "fuso horário IANA desconhecido")
  .meta({ description: "Fuso IANA do evento, para exibição", example: "America/Sao_Paulo" });

export const venueSchema = z
  .strictObject({
    name: optionalText(120).meta({ example: "Circo Voador" }),
    address: optionalText(200).meta({ example: "Rua dos Arcos, s/n – Lapa" }),
    city: optionalText(80).meta({ example: "Rio de Janeiro" }),
    state: z.enum(BRAZILIAN_STATES).meta({ description: "UF" }),
  })
  .meta({ id: "Venue" });

const titleSchema = z
  .string()
  .trim()
  .min(EVENT_TITLE_MIN_LENGTH)
  .max(EVENT_TITLE_MAX_LENGTH)
  .meta({ example: "Noite de forró no Circo" });

const descriptionMdSchema = z
  .string()
  .max(EVENT_DESCRIPTION_MAX_LENGTH)
  .meta({
    description:
      "Markdown do organizador. HTML não é aceito: vira texto. O servidor gera o HTML " +
      "sanitizado (`descriptionHtml`).",
  });

const endsAfterStart = (body: { startsAt?: string | undefined; endsAt?: string | undefined }) =>
  body.startsAt === undefined ||
  body.endsAt === undefined ||
  Date.parse(body.endsAt) > Date.parse(body.startsAt);
const endsAfterStartIssue = { message: "o fim deve ser depois do início", path: ["endsAt"] };

export const createEventRequestSchema = z
  .strictObject({
    title: titleSchema,
    descriptionMd: descriptionMdSchema.default(""),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
    timezone: timeZoneSchema,
    venue: venueSchema.optional(),
  })
  .refine(endsAfterStart, endsAfterStartIssue)
  .meta({ id: "CreateEventRequest" });

export const updateEventRequestSchema = z
  .strictObject({
    title: titleSchema.optional(),
    descriptionMd: descriptionMdSchema.optional(),
    startsAt: dateTimeSchema.optional(),
    endsAt: dateTimeSchema.optional(),
    timezone: timeZoneSchema.optional(),
    venue: venueSchema.nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "informe ao menos um campo")
  .refine(endsAfterStart, endsAfterStartIssue)
  .meta({ id: "UpdateEventRequest" });

export const cancelEventRequestSchema = z
  .strictObject({
    reason: z.string().trim().min(3).max(CANCEL_REASON_MAX_LENGTH).meta({
      description: "Motivo mostrado a quem comprou",
    }),
  })
  .meta({ id: "CancelEventRequest" });

const priceCentsSchema = z
  .number()
  .int()
  .min(TICKET_PRICE_MIN_CENTS)
  .max(TICKET_PRICE_MAX_CENTS)
  .meta({ description: "Preço em centavos (BRL)", example: 8000 });
const capacitySchema = z.number().int().min(1).max(TICKET_CAPACITY_MAX);
const maxPerOrderSchema = z.number().int().min(1).max(MAX_PER_ORDER_LIMIT);

const salesWindowIsOrdered = (body: {
  salesStartAt?: string | null | undefined;
  salesEndAt?: string | null | undefined;
}) =>
  !body.salesStartAt ||
  !body.salesEndAt ||
  Date.parse(body.salesEndAt) > Date.parse(body.salesStartAt);
const salesWindowIssue = {
  message: "o fim das vendas deve ser depois do início",
  path: ["salesEndAt"],
};

export const createTicketTypeRequestSchema = z
  .strictObject({
    name: optionalText(TICKET_TYPE_NAME_MAX_LENGTH).meta({ example: "Pista – Lote 1" }),
    description: optionalText(TICKET_TYPE_DESCRIPTION_MAX_LENGTH).optional(),
    priceCents: priceCentsSchema,
    capacity: capacitySchema,
    maxPerOrder: maxPerOrderSchema.default(MAX_PER_ORDER_DEFAULT),
    salesStartAt: dateTimeSchema.optional(),
    salesEndAt: dateTimeSchema.optional(),
  })
  .refine(salesWindowIsOrdered, salesWindowIssue)
  .meta({ id: "CreateTicketTypeRequest" });

export const updateTicketTypeRequestSchema = z
  .strictObject({
    name: optionalText(TICKET_TYPE_NAME_MAX_LENGTH).optional(),
    description: optionalText(TICKET_TYPE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    priceCents: priceCentsSchema.optional(),
    capacity: capacitySchema.optional(),
    maxPerOrder: maxPerOrderSchema.optional(),
    salesStartAt: dateTimeSchema.nullable().optional(),
    salesEndAt: dateTimeSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "informe ao menos um campo")
  .refine(salesWindowIsOrdered, salesWindowIssue)
  .meta({ id: "UpdateTicketTypeRequest" });

export const listOrganizerEventsQuerySchema = z
  .strictObject({
    status: z.enum(EVENT_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
    cursor: z.string().max(512).optional(),
  })
  .meta({ id: "ListOrganizerEventsQuery" });

export const requestImageUploadSchema = z
  .strictObject({
    contentType: z.enum(EVENT_IMAGE_CONTENT_TYPES).meta({
      description: "Tipo do arquivo, igual ao `Content-Type` do envio",
    }),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(EVENT_IMAGE_MAX_BYTES)
      .meta({ description: "Tamanho exato do arquivo em bytes (até 5 MB)", example: 734_003 }),
  })
  .meta({ id: "RequestImageUpload" });

export const imageUploadSchema = z
  .strictObject({
    uploadId: z.uuid(),
    url: z.string().meta({ description: "URL pré-assinada: envie o arquivo com `PUT`" }),
    headers: z.record(z.string(), z.string()).meta({
      description: "Cabeçalhos que o `PUT` precisa levar, exatamente como estão",
    }),
    expiresAt: z.string().meta({ description: "Até quando a URL aceita o envio" }),
  })
  .meta({ id: "ImageUpload" });

export const attachEventImageRequestSchema = z
  .strictObject({
    uploadId: z.uuid(),
    alt: z.string().trim().min(3).max(EVENT_IMAGE_ALT_MAX_LENGTH).meta({
      description: "Descrição da imagem para quem não a vê (texto alternativo)",
      example: "Pista cheia sob a lona do Circo Voador",
    }),
  })
  .meta({ id: "AttachEventImageRequest" });

/** Ids in paths are UUIDs: anything else is a `400` before any lookup. */
export const resourceIdSchema = z.uuid();

export const moneySchema = z
  .strictObject({
    amountCents: z.number().int(),
    currency: z.literal("BRL"),
  })
  .meta({ id: "Money" });

export const ticketTypeSchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    price: moneySchema,
    capacity: z.number().int(),
    sold: z.number().int(),
    reserved: z.number().int(),
    maxPerOrder: z.number().int(),
    salesStartAt: z.string().nullable(),
    salesEndAt: z.string().nullable(),
    sortOrder: z.number().int(),
  })
  .meta({ id: "TicketType" });

const eventFields = {
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(EVENT_STATUSES),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  venue: venueSchema.nullable(),
  isDemo: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const eventImageSchema = z
  .strictObject({
    url: z.string().meta({ description: "Endereço assinado da imagem, válido por 1 hora" }),
    alt: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    blurDataUrl: z.string().meta({ description: "Prévia borrada (data URL) para `next/image`" }),
  })
  .meta({ id: "EventImage" });

/** An event as its organizer sees it, ticket types included. */
export const organizerEventSchema = z
  .strictObject({
    ...eventFields,
    descriptionMd: z.string(),
    descriptionHtml: z.string().meta({ description: "HTML sanitizado gerado pelo servidor" }),
    image: eventImageSchema.nullable(),
    publishedAt: z.string().nullable(),
    canceledAt: z.string().nullable(),
    cancelReason: z.string().nullable(),
    ticketTypes: z.array(ticketTypeSchema),
  })
  .meta({ id: "OrganizerEvent" });

export const organizerEventSummarySchema = z
  .strictObject({ ...eventFields, ticketTypeCount: z.number().int() })
  .meta({ id: "OrganizerEventSummary" });

export const pageSchema = z
  .strictObject({
    nextCursor: z.string().nullable().meta({ description: "`null` no fim da lista" }),
    limit: z.number().int(),
  })
  .meta({ id: "Page" });

export const organizerEventListSchema = z
  .strictObject({ data: z.array(organizerEventSummarySchema), page: pageSchema })
  .meta({ id: "OrganizerEventList" });

export type Venue = z.infer<typeof venueSchema>;
export type BrazilianState = (typeof BRAZILIAN_STATES)[number];
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;
export type CancelEventRequest = z.infer<typeof cancelEventRequestSchema>;
export type CreateTicketTypeRequest = z.infer<typeof createTicketTypeRequestSchema>;
export type UpdateTicketTypeRequest = z.infer<typeof updateTicketTypeRequestSchema>;
export type ListOrganizerEventsQuery = z.infer<typeof listOrganizerEventsQuerySchema>;
export type RequestImageUpload = z.infer<typeof requestImageUploadSchema>;
export type ImageUpload = z.infer<typeof imageUploadSchema>;
export type AttachEventImageRequest = z.infer<typeof attachEventImageRequestSchema>;
export type EventImageBody = z.infer<typeof eventImageSchema>;
export type Money = z.infer<typeof moneySchema>;
export type TicketTypeBody = z.infer<typeof ticketTypeSchema>;
export type OrganizerEvent = z.infer<typeof organizerEventSchema>;
export type OrganizerEventSummary = z.infer<typeof organizerEventSummarySchema>;
export type OrganizerEventList = z.infer<typeof organizerEventListSchema>;
