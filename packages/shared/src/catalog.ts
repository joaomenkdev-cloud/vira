import { z } from "zod";

import {
  BRAZILIAN_STATES,
  eventImageSchema,
  moneySchema,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  pageSchema,
} from "./events.js";

/**
 * Contracts of the public storefront (N10, docs/API.md#vitrine-catalog--somente-eventos-publicados).
 * Only published events are shown; the lists leave out events that have ended, and the
 * event page also answers for a canceled one, so a link a buyer saved keeps working.
 */

export const CATALOG_SEARCH_MIN_LENGTH = 2;
export const CATALOG_SEARCH_MAX_LENGTH = 80;
/** How many events the home page highlights. */
export const FEATURED_EVENTS_LIMIT = 6;

/** Same format as the one the API generates (docs/DATA_MODEL.md#events). */
export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const eventSlugSchema = z.string().max(80).regex(EVENT_SLUG_PATTERN);

const queryDateTimeSchema = z.iso
  .datetime({ offset: true })
  .meta({ description: "Data e hora ISO 8601", example: "2026-12-01T00:00:00-03:00" });

export const listCatalogEventsQuerySchema = z
  .strictObject({
    q: z
      .string()
      .trim()
      .min(CATALOG_SEARCH_MIN_LENGTH)
      .max(CATALOG_SEARCH_MAX_LENGTH)
      .optional()
      .meta({ description: "Busca no título, sem diferenciar maiúsculas", example: "forró" }),
    city: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .optional()
      .meta({ description: "Cidade do local, sem diferenciar maiúsculas", example: "Recife" }),
    from: queryDateTimeSchema.optional().meta({ description: "Começa a partir de (inclusive)" }),
    to: queryDateTimeSchema.optional().meta({ description: "Começa antes de (exclusive)" }),
    limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
    cursor: z.string().max(512).optional(),
  })
  .refine((query) => !query.from || !query.to || Date.parse(query.to) > Date.parse(query.from), {
    message: "`to` deve ser depois de `from`",
    path: ["to"],
  })
  .meta({ id: "ListCatalogEventsQuery" });

/** Where a ticket type stands for a buyer right now. */
export const SALES_STATUSES = ["ON_SALE", "NOT_STARTED", "SOLD_OUT", "CLOSED"] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];

const publicEventFields = {
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(["PUBLISHED", "CANCELED"]).meta({
    description: "Só a página do evento mostra um evento cancelado; as listas, nunca",
  }),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  isDemo: z.boolean().meta({ description: 'Evento de exemplo do seed ("Demonstração")' }),
  priceFrom: moneySchema.nullable().meta({
    description: "Menor preço entre os ingressos que ainda restam; `null` se não resta nenhum",
  }),
  soldOut: z.boolean().meta({ description: "Nenhum tipo de ingresso tem ingresso restante" }),
};

export const catalogEventSummarySchema = z
  .strictObject({
    ...publicEventFields,
    venue: z.strictObject({ name: z.string(), city: z.string(), state: z.enum(BRAZILIAN_STATES) }),
    image: eventImageSchema,
  })
  .meta({ id: "EventSummary" });

export const catalogEventListSchema = z
  .strictObject({ data: z.array(catalogEventSummarySchema), page: pageSchema })
  .meta({ id: "EventSummaryList" });

export const featuredEventsSchema = z
  .strictObject({ data: z.array(catalogEventSummarySchema).max(FEATURED_EVENTS_LIMIT) })
  .meta({ id: "FeaturedEvents" });

export const imageCreditSchema = z
  .strictObject({
    author: z.string(),
    url: z.string(),
    license: z.string(),
  })
  .meta({
    id: "ImageCredit",
    description: "Crédito da foto de licença livre (eventos de exemplo)",
  });

export const publicTicketTypeSchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    price: moneySchema,
    maxPerOrder: z.number().int(),
    available: z.number().int().meta({ description: "Ingressos que ainda restam" }),
    salesStartAt: z.string().nullable(),
    salesEndAt: z.string().nullable(),
    salesStatus: z.enum(SALES_STATUSES),
  })
  .meta({ id: "PublicTicketType" });

export const catalogEventDetailSchema = z
  .strictObject({
    ...publicEventFields,
    descriptionHtml: z.string().meta({ description: "HTML sanitizado gerado pelo servidor" }),
    venue: z.strictObject({
      name: z.string(),
      address: z.string(),
      city: z.string(),
      state: z.enum(BRAZILIAN_STATES),
    }),
    image: z
      .strictObject({ ...eventImageSchema.shape, credit: imageCreditSchema.nullable() })
      .meta({ id: "EventDetailImage" }),
    organizer: z.strictObject({ name: z.string() }),
    ticketTypes: z.array(publicTicketTypeSchema),
  })
  .meta({ id: "EventDetail" });

export type ListCatalogEventsQuery = z.infer<typeof listCatalogEventsQuerySchema>;
export type CatalogEventSummary = z.infer<typeof catalogEventSummarySchema>;
export type CatalogEventList = z.infer<typeof catalogEventListSchema>;
export type FeaturedEvents = z.infer<typeof featuredEventsSchema>;
export type PublicTicketType = z.infer<typeof publicTicketTypeSchema>;
export type CatalogEventDetail = z.infer<typeof catalogEventDetailSchema>;
