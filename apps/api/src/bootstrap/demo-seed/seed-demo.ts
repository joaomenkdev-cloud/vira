import { v5 as uuidv5 } from "uuid";

import type { PrismaClient } from "../../generated/prisma/client.js";
import type { ImageProcessor } from "../../modules/events/application/ports/image-processor.js";
import type { MarkdownRenderer } from "../../modules/events/application/ports/markdown-renderer.js";
import { imageObjectKey } from "../../modules/events/domain/event-image.js";
import type { ObjectStorage } from "../../platform/storage/object-storage.js";
import { DEMO_EVENTS, DEMO_ORGANIZER, type DemoEvent, type DemoPhoto } from "./demo-events.js";
import { eventDates, salesWindow } from "./schedule.js";

/**
 * Ids of the seeded rows are derived from stable names (UUIDv5), never random: running
 * the seed again finds the same rows and updates them instead of adding copies.
 */
const DEMO_NAMESPACE = "6f4b1d0e-8c1a-4e57-9d2b-3a7c5e9f1b20";
const demoId = (name: string) => uuidv5(name, DEMO_NAMESPACE);

export const DEMO_USER_ID = demoId("user");
export const DEMO_ORGANIZER_ID = demoId("organizer");
export const demoEventId = (event: DemoEvent) => demoId(`event/${event.key}`);
const demoTicketTypeId = (event: DemoEvent, key: string) =>
  demoId(`ticket-type/${event.key}/${key}`);

/** Same as the uploads (N9): the key changes whenever the picture does. */
const IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";

export interface DemoSeedDependencies {
  readonly prisma: PrismaClient;
  readonly storage: ObjectStorage;
  readonly images: ImageProcessor;
  readonly markdown: MarkdownRenderer;
  /** The photo's bytes (a JPEG), from its `sourceUrl`. */
  readonly fetchPhoto: (photo: DemoPhoto) => Promise<Buffer>;
  readonly now: () => Date;
  readonly log: (message: string) => void;
}

export interface DemoSeedResult {
  readonly events: number;
  /** Photos downloaded and processed by this run; the others were already in the bucket. */
  readonly photosFetched: number;
}

/** The account and organizer profile every demo event belongs to. */
async function upsertOrganizer({ prisma, now }: DemoSeedDependencies): Promise<void> {
  const owner = await prisma.user.findUnique({
    where: { email: DEMO_ORGANIZER.email },
    select: { id: true },
  });
  if (owner && owner.id !== DEMO_USER_ID) {
    throw new Error(`${DEMO_ORGANIZER.email} belongs to an account the seed did not create.`);
  }
  const at = now();
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    // No password and an address that cannot receive mail: nobody signs in as the demo.
    create: {
      id: DEMO_USER_ID,
      email: DEMO_ORGANIZER.email,
      name: DEMO_ORGANIZER.name,
      role: "ORGANIZER",
      createdAt: at,
    },
    update: { name: DEMO_ORGANIZER.name, role: "ORGANIZER" },
  });
  await prisma.organizerProfile.upsert({
    where: { id: DEMO_ORGANIZER_ID },
    create: {
      id: DEMO_ORGANIZER_ID,
      userId: DEMO_USER_ID,
      displayName: DEMO_ORGANIZER.displayName,
      slug: DEMO_ORGANIZER.slug,
      createdAt: at,
    },
    update: { displayName: DEMO_ORGANIZER.displayName },
  });
}

interface StoredImage {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly blurDataUrl: string;
}

/**
 * The event's picture in the bucket: the one already there when it is this photo, else
 * the photo downloaded and run through the same processing as an upload (N9).
 */
async function ensureImage(
  deps: DemoSeedDependencies,
  event: DemoEvent,
  eventId: string,
  current: Partial<Record<"imageKey" | "imageBlurDataUrl", string | null>> &
    Partial<Record<"imageWidth" | "imageHeight", number | null>>,
): Promise<{ image: StoredImage; fetched: boolean }> {
  const key = imageObjectKey(eventId, demoId(`image/${event.photo.sourceUrl}`));
  if (
    current.imageKey === key &&
    current.imageWidth &&
    current.imageHeight &&
    current.imageBlurDataUrl &&
    (await deps.storage.stat(key))
  ) {
    const { imageWidth: width, imageHeight: height, imageBlurDataUrl: blurDataUrl } = current;
    return { image: { key, width, height, blurDataUrl }, fetched: false };
  }
  deps.log(`Downloading the photo of "${event.title}"...`);
  const processed = await deps.images.process(await deps.fetchPhoto(event.photo), "image/jpeg");
  await deps.storage.write(key, processed.data, {
    contentType: processed.contentType,
    cacheControl: IMAGE_CACHE_CONTROL,
  });
  const { width, height, blurDataUrl } = processed;
  return { image: { key, width, height, blurDataUrl }, fetched: true };
}

async function upsertEvent(deps: DemoSeedDependencies, event: DemoEvent): Promise<boolean> {
  const { prisma } = deps;
  const id = demoEventId(event);
  const current = await prisma.event.findUnique({
    where: { id },
    select: {
      isDemo: true,
      imageKey: true,
      imageWidth: true,
      imageHeight: true,
      imageBlurDataUrl: true,
    },
  });
  if (current && !current.isDemo) throw new Error(`Event ${id} is not a demo event.`);

  const { image, fetched } = await ensureImage(deps, event, id, current ?? {});
  const at = deps.now();
  const dates = eventDates(event, at);
  const fields = {
    slug: event.slug,
    title: event.title,
    descriptionMd: event.descriptionMd,
    descriptionHtml: deps.markdown.render(event.descriptionMd),
    // Published and on sale, even if it had been canceled by hand since the last run.
    status: "PUBLISHED" as const,
    canceledAt: null,
    cancelReason: null,
    startsAt: dates.startsAt,
    endsAt: dates.endsAt,
    timezone: event.timezone,
    venueName: event.venue.name,
    venueAddress: event.venue.address,
    venueCity: event.venue.city,
    venueState: event.venue.state,
    imageKey: image.key,
    imageAlt: event.photo.alt,
    imageWidth: image.width,
    imageHeight: image.height,
    imageBlurDataUrl: image.blurDataUrl,
    imageCreditAuthor: event.photo.credit.author,
    imageCreditUrl: event.photo.credit.url,
    imageLicense: event.photo.credit.license,
  };
  const ticketTypeIds = event.ticketTypes.map((ticketType) =>
    demoTicketTypeId(event, ticketType.key),
  );

  await prisma.$transaction([
    prisma.event.upsert({
      where: { id },
      create: {
        id,
        organizerId: DEMO_ORGANIZER_ID,
        isDemo: true,
        publishedAt: at,
        createdAt: at,
        ...fields,
      },
      update: fields,
    }),
    // Ticket types the seed no longer lists go, unless something was sold or reserved.
    prisma.ticketType.deleteMany({
      where: { eventId: id, id: { notIn: ticketTypeIds }, sold: 0, reserved: 0 },
    }),
    ...event.ticketTypes.map((ticketType, sortOrder) => {
      const ticketTypeFields = {
        name: ticketType.name,
        description: ticketType.description ?? null,
        priceCents: ticketType.priceCents,
        capacity: ticketType.capacity,
        maxPerOrder: ticketType.maxPerOrder,
        ...salesWindow(ticketType, dates),
        sortOrder,
      };
      const ticketTypeId = demoTicketTypeId(event, ticketType.key);
      return prisma.ticketType.upsert({
        where: { id: ticketTypeId },
        // `sold` and `reserved` are never touched: they belong to the orders.
        create: { id: ticketTypeId, eventId: id, createdAt: at, ...ticketTypeFields },
        update: ticketTypeFields,
      });
    }),
  ]);

  // The picture of the previous run, when the photo changed.
  if (current?.imageKey && current.imageKey !== image.key) {
    await deps.storage.delete([current.imageKey]);
  }
  return fetched;
}

/**
 * `pnpm db:seed:demo`: creates the demo organizer and events, or brings them up to date.
 * Safe to run again: nothing is duplicated, dates move forward with the day it runs and
 * photos already in the bucket are not downloaded again.
 */
export async function seedDemo(deps: DemoSeedDependencies): Promise<DemoSeedResult> {
  await upsertOrganizer(deps);
  let photosFetched = 0;
  for (const event of DEMO_EVENTS) {
    if (await upsertEvent(deps, event)) photosFetched += 1;
  }
  return { events: DEMO_EVENTS.length, photosFetched };
}

/**
 * `pnpm db:seed:demo --reset`: removes every demo event (and its ticket types and
 * picture) and the demo organizer. Nothing else is touched.
 */
export async function resetDemo(
  deps: Pick<DemoSeedDependencies, "prisma" | "storage">,
): Promise<{ events: number }> {
  const { prisma, storage } = deps;
  const events = await prisma.event.findMany({
    where: { isDemo: true },
    select: { imageKey: true },
  });
  await prisma.$transaction([
    prisma.event.deleteMany({ where: { isDemo: true } }),
    // The profile goes with the account (cascade), as long as no other event uses it.
    prisma.user.deleteMany({
      where: { id: DEMO_USER_ID, organizerProfile: { events: { none: {} } } },
    }),
  ]);
  const keys = events.flatMap((event) => (event.imageKey ? [event.imageKey] : []));
  await storage.delete(keys);
  return { events: events.length };
}
