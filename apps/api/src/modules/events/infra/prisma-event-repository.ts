import { Injectable } from "@nestjs/common";
import type { BrazilianState } from "@vira/shared";

import type { Prisma } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  EventChanges,
  EventListQuery,
  EventRepository,
  EventSummary,
  NewEvent,
  NewTicketType,
  TicketTypeChanges,
} from "../application/ports/event-repository.js";
import type { Event, EventImage, TicketType, Venue } from "../domain/event.js";

const withTicketTypes = {
  ticketTypes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof withTicketTypes }>;
type EventColumns = Omit<EventRow, "ticketTypes" | "descriptionMd" | "descriptionHtml">;

function venueOf(row: EventColumns): Venue | null {
  if (!row.venueName || !row.venueAddress || !row.venueCity || !row.venueState) return null;
  return {
    name: row.venueName,
    address: row.venueAddress,
    city: row.venueCity,
    state: row.venueState as BrazilianState,
  };
}

function venueColumns(venue: Venue | null) {
  return {
    venueName: venue?.name ?? null,
    venueAddress: venue?.address ?? null,
    venueCity: venue?.city ?? null,
    venueState: venue?.state ?? null,
  };
}

function imageOf(row: EventColumns): EventImage | null {
  // The migration keeps the four columns together (`events_image_details`).
  if (!row.imageKey || !row.imageWidth || !row.imageHeight || !row.imageBlurDataUrl) return null;
  return {
    key: row.imageKey,
    alt: row.imageAlt,
    width: row.imageWidth,
    height: row.imageHeight,
    blurDataUrl: row.imageBlurDataUrl,
  };
}

function ticketTypeOf(row: EventRow["ticketTypes"][number]): TicketType {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    capacity: row.capacity,
    sold: row.sold,
    reserved: row.reserved,
    maxPerOrder: row.maxPerOrder,
    salesStartAt: row.salesStartAt,
    salesEndAt: row.salesEndAt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

function columnsOf(
  row: EventColumns,
): Omit<Event, "ticketTypes" | "descriptionMd" | "descriptionHtml"> {
  return {
    id: row.id,
    organizerId: row.organizerId,
    slug: row.slug,
    title: row.title,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    venue: venueOf(row),
    image: imageOf(row),
    isDemo: row.isDemo,
    publishedAt: row.publishedAt,
    canceledAt: row.canceledAt,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function eventOf(row: EventRow): Event {
  return {
    ...columnsOf(row),
    descriptionMd: row.descriptionMd,
    descriptionHtml: row.descriptionHtml,
    ticketTypes: row.ticketTypes.map(ticketTypeOf),
  };
}

/**
 * Events and ticket types in PostgreSQL. Ownership is part of every lookup's `WHERE`;
 * the invariants (complete publication, inventory) are also CHECKs in the migration.
 */
@Injectable()
export class PrismaEventRepository implements EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(event: NewEvent): Promise<boolean> {
    // INSERT ... ON CONFLICT DO NOTHING: a taken slug skips the row instead of failing.
    const { count } = await this.prisma.event.createMany({
      data: [
        {
          id: event.id,
          organizerId: event.organizerId,
          slug: event.slug,
          title: event.title,
          descriptionMd: event.descriptionMd,
          descriptionHtml: event.descriptionHtml,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: event.timezone,
          ...venueColumns(event.venue),
          createdAt: event.createdAt,
          updatedAt: event.createdAt,
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async findOwned(
    eventId: string,
    organizerId: string,
    options: { readonly tx?: TransactionContext; readonly lock?: boolean } = {},
  ): Promise<Event | null> {
    const client = clientFor(this.prisma, options.tx);
    if (options.lock) {
      const locked = await client.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "events"
         WHERE "id" = ${eventId}::uuid AND "organizer_id" = ${organizerId}::uuid
           FOR UPDATE`;
      if (locked.length === 0) return null;
    }
    const row = await client.event.findFirst({
      where: { id: eventId, organizerId },
      include: withTicketTypes,
    });
    return row && eventOf(row);
  }

  async findOwnedByTicketType(
    ticketTypeId: string,
    organizerId: string,
    options: { readonly tx?: TransactionContext; readonly lock?: boolean } = {},
  ): Promise<Event | null> {
    const client = clientFor(this.prisma, options.tx);
    const owner = await client.$queryRaw<{ id: string }[]>`
      SELECT e."id" FROM "events" e
        JOIN "ticket_types" t ON t."event_id" = e."id"
       WHERE t."id" = ${ticketTypeId}::uuid AND e."organizer_id" = ${organizerId}::uuid`;
    const eventId = owner[0]?.id;
    if (!eventId) return null;
    return this.findOwned(eventId, organizerId, options);
  }

  async listOwned(organizerId: string, query: EventListQuery): Promise<EventSummary[]> {
    const { after } = query;
    const rows = await this.prisma.event.findMany({
      where: {
        organizerId,
        ...(query.status ? { status: query.status } : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      omit: { descriptionMd: true, descriptionHtml: true },
      include: { _count: { select: { ticketTypes: true } } },
    });
    return rows.map((row) => ({ ...columnsOf(row), ticketTypeCount: row._count.ticketTypes }));
  }

  async update(eventId: string, changes: EventChanges, tx?: TransactionContext): Promise<void> {
    const { venue, ...rest } = changes;
    await clientFor(this.prisma, tx).event.update({
      where: { id: eventId },
      data: { ...rest, ...(venue === undefined ? {} : venueColumns(venue)) },
    });
  }

  async deleteDraft(eventId: string, organizerId: string): Promise<boolean> {
    const { count } = await this.prisma.event.deleteMany({
      where: { id: eventId, organizerId, status: "DRAFT" },
    });
    return count === 1;
  }

  async publish(
    eventId: string,
    change: { readonly slug: string; readonly publishedAt: Date },
    tx?: TransactionContext,
  ): Promise<"published" | "not-draft" | "slug-taken"> {
    const client = clientFor(this.prisma, tx);
    // Checked first: a unique violation would abort the whole transaction.
    const taken = await client.event.findUnique({
      where: { slug: change.slug },
      select: { id: true },
    });
    if (taken && taken.id !== eventId) return "slug-taken";
    const { count } = await client.event.updateMany({
      where: { id: eventId, status: "DRAFT" },
      data: { status: "PUBLISHED", slug: change.slug, publishedAt: change.publishedAt },
    });
    return count === 1 ? "published" : "not-draft";
  }

  async cancel(
    eventId: string,
    change: { readonly reason: string; readonly canceledAt: Date },
    tx?: TransactionContext,
  ): Promise<boolean> {
    const { count } = await clientFor(this.prisma, tx).event.updateMany({
      where: { id: eventId, status: "PUBLISHED" },
      data: { status: "CANCELED", cancelReason: change.reason, canceledAt: change.canceledAt },
    });
    return count === 1;
  }

  async setImage(eventId: string, image: EventImage, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).event.update({
      where: { id: eventId },
      data: {
        imageKey: image.key,
        imageAlt: image.alt,
        imageWidth: image.width,
        imageHeight: image.height,
        imageBlurDataUrl: image.blurDataUrl,
      },
    });
  }

  async createTicketType(ticketType: NewTicketType, tx?: TransactionContext): Promise<void> {
    await clientFor(this.prisma, tx).ticketType.create({
      data: { ...ticketType, updatedAt: ticketType.createdAt },
    });
  }

  async updateTicketType(
    ticketTypeId: string,
    changes: TicketTypeChanges,
    tx?: TransactionContext,
  ): Promise<"updated" | "below-committed"> {
    const client = clientFor(this.prisma, tx);
    const { capacity, ...rest } = changes;
    if (capacity !== undefined) {
      // One statement compares and writes: an order reserving meanwhile cannot slip in.
      const updated = await client.$executeRaw`
        UPDATE "ticket_types" SET "capacity" = ${capacity}
         WHERE "id" = ${ticketTypeId}::uuid AND "sold" + "reserved" <= ${capacity}`;
      if (updated === 0) return "below-committed";
    }
    await client.ticketType.update({ where: { id: ticketTypeId }, data: rest });
    return "updated";
  }

  async deleteUnsoldTicketType(ticketTypeId: string, tx?: TransactionContext): Promise<boolean> {
    // A ticket type that was ever ordered stays: the order still shows its name (and the
    // foreign key of `order_items` would refuse it anyway).
    const { count } = await clientFor(this.prisma, tx).ticketType.deleteMany({
      where: { id: ticketTypeId, sold: 0, reserved: 0, orderItems: { none: {} } },
    });
    return count === 1;
  }
}
