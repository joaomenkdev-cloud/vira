import { Injectable } from "@nestjs/common";
import type { BrazilianState } from "@vira/shared";

import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type {
  CatalogListQuery,
  CatalogRepository,
} from "../application/ports/catalog-repository.js";
import type {
  CatalogEvent,
  CatalogEventDetail,
  CatalogImage,
  CatalogVenue,
} from "../domain/catalog-event.js";

/** Only what the public may see: no `descriptionMd`, cancel reason or organizer id. */
const summaryColumns = {
  id: true,
  slug: true,
  title: true,
  status: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  venueName: true,
  venueAddress: true,
  venueCity: true,
  venueState: true,
  imageKey: true,
  imageAlt: true,
  imageWidth: true,
  imageHeight: true,
  imageBlurDataUrl: true,
  imageCreditAuthor: true,
  imageCreditUrl: true,
  imageLicense: true,
  isDemo: true,
  ticketTypes: {
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      capacity: true,
      sold: true,
      reserved: true,
      maxPerOrder: true,
      salesStartAt: true,
      salesEndAt: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.EventSelect;

const detailColumns = {
  ...summaryColumns,
  descriptionHtml: true,
  organizer: { select: { displayName: true } },
} satisfies Prisma.EventSelect;

type SummaryRow = Prisma.EventGetPayload<{ select: typeof summaryColumns }>;
type DetailRow = Prisma.EventGetPayload<{ select: typeof detailColumns }>;

/** Published, so complete: the `events_published_complete` CHECK keeps venue and image. */
const publicEvent = {
  status: "PUBLISHED",
  venueName: { not: null },
  imageKey: { not: null },
} satisfies Prisma.EventWhereInput;

function venueOf(row: SummaryRow): CatalogVenue | null {
  if (!row.venueName || !row.venueAddress || !row.venueCity || !row.venueState) return null;
  return {
    name: row.venueName,
    address: row.venueAddress,
    city: row.venueCity,
    state: row.venueState as BrazilianState,
  };
}

function imageOf(row: SummaryRow): CatalogImage | null {
  const { imageKey, imageAlt, imageWidth, imageHeight, imageBlurDataUrl } = row;
  if (!imageKey || !imageAlt || !imageWidth || !imageHeight || !imageBlurDataUrl) return null;
  const { imageCreditAuthor: author, imageCreditUrl: url, imageLicense: license } = row;
  return {
    key: imageKey,
    alt: imageAlt,
    width: imageWidth,
    height: imageHeight,
    blurDataUrl: imageBlurDataUrl,
    credit: author && url && license ? { author, url, license } : null,
  };
}

function eventOf(row: SummaryRow): CatalogEvent | null {
  const venue = venueOf(row);
  const image = imageOf(row);
  // A draft never gets here; a canceled event keeps what it had when published.
  if (row.status === "DRAFT" || !venue || !image) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    venue,
    image,
    isDemo: row.isDemo,
    ticketTypes: row.ticketTypes,
  };
}

function detailOf(row: DetailRow): CatalogEventDetail | null {
  const event = eventOf(row);
  return (
    event && {
      ...event,
      descriptionHtml: row.descriptionHtml,
      organizerName: row.organizer.displayName,
    }
  );
}

/**
 * `%` and `_` are wildcards of `ILIKE`, which Prisma uses for `contains` and for
 * case-insensitive `equals`: a search for them means the characters themselves.
 */
const literal = (text: string) => text.replace(/[\\%_]/g, "\\$&");

const present = <T>(value: T | null): value is T => value !== null;

/** The storefront's reads of `events` and `ticket_types` in PostgreSQL. */
@Injectable()
export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CatalogListQuery): Promise<CatalogEvent[]> {
    const { after } = query;
    const rows = await this.prisma.event.findMany({
      where: {
        ...publicEvent,
        AND: [
          { endsAt: { gt: query.now } },
          // `title` has a trigram index (events_title_trgm_idx) for this ILIKE.
          query.q ? { title: { contains: literal(query.q), mode: "insensitive" } } : {},
          query.city ? { venueCity: { equals: literal(query.city), mode: "insensitive" } } : {},
          query.from ? { startsAt: { gte: query.from } } : {},
          query.to ? { startsAt: { lt: query.to } } : {},
          after
            ? {
                OR: [
                  { startsAt: { gt: after.startsAt } },
                  { startsAt: after.startsAt, id: { gt: after.id } },
                ],
              }
            : {},
        ],
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      select: summaryColumns,
    });
    return rows.map(eventOf).filter(present);
  }

  async featured(now: Date, limit: number): Promise<CatalogEvent[]> {
    // "On sale" compares columns of the same row (capacity against sold + reserved),
    // which the query builder cannot say.
    const picked = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT e."id" FROM "events" e
       WHERE e."status" = 'PUBLISHED' AND e."starts_at" > ${now}
         AND EXISTS (
           SELECT 1 FROM "ticket_types" t
            WHERE t."event_id" = e."id"
              AND t."capacity" > t."sold" + t."reserved"
              AND (t."sales_start_at" IS NULL OR t."sales_start_at" <= ${now})
              AND (t."sales_end_at" IS NULL OR t."sales_end_at" > ${now}))
       ORDER BY e."starts_at", e."id"
       LIMIT ${limit}`;
    if (picked.length === 0) return [];
    const rows = await this.prisma.event.findMany({
      where: { ...publicEvent, id: { in: picked.map((row) => row.id) } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      select: summaryColumns,
    });
    return rows.map(eventOf).filter(present);
  }

  async findBySlug(slug: string): Promise<CatalogEventDetail | null> {
    const row = await this.prisma.event.findFirst({
      where: { slug, status: { in: ["PUBLISHED", "CANCELED"] } },
      select: detailColumns,
    });
    return row && detailOf(row);
  }
}
