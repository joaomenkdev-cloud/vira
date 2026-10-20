import { catalogEventDetailSchema, catalogEventListSchema } from "@vira/shared";
import sharp from "sharp";
import request from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_EVENTS, type DemoPhoto } from "../../src/bootstrap/demo-seed/demo-events.js";
import {
  DEMO_USER_ID,
  type DemoSeedDependencies,
  resetDemo,
  seedDemo,
} from "../../src/bootstrap/demo-seed/seed-demo.js";
import { SanitizedMarkdownRenderer } from "../../src/modules/events/infra/sanitized-markdown-renderer.js";
import { SharpImageProcessor } from "../../src/modules/events/infra/sharp-image-processor.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { setUpBucket } from "../../src/platform/storage/bucket-setup.js";
import { createS3Client, S3ObjectStorage } from "../../src/platform/storage/s3-object-storage.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

describe.skipIf(!dockerAvailable)("demo seed (PostgreSQL + S3)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  let s3: ReturnType<typeof createS3Client>;
  let storage: S3ObjectStorage;
  const api = () => request(testApp.app.getHttpServer());
  /** Photos "downloaded" so far; the seed never reaches the internet in tests. */
  const fetched: string[] = [];

  /** Stands in for the Unsplash photo: a JPEG of the size the seed asks for. */
  function fetchPhoto(photo: DemoPhoto): Promise<Buffer> {
    fetched.push(photo.sourceUrl);
    return sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 40, g: 40, b: 60 } },
    })
      .jpeg()
      .toBuffer();
  }

  function deps(): DemoSeedDependencies {
    return {
      prisma,
      storage,
      images: new SharpImageProcessor(),
      markdown: new SanitizedMarkdownRenderer(),
      fetchPhoto,
      now: () => new Date(),
      log: () => undefined,
    };
  }

  async function counts() {
    const [events, ticketTypes, users, organizers] = await Promise.all([
      prisma.event.count({ where: { isDemo: true } }),
      prisma.ticketType.count({ where: { event: { isDemo: true } } }),
      prisma.user.count({ where: { id: DEMO_USER_ID } }),
      prisma.organizerProfile.count({ where: { userId: DEMO_USER_ID } }),
    ]);
    return { events, ticketTypes, users, organizers };
  }

  /** A real organizer's published event, which the reset must leave alone. */
  async function insertOtherEvent(): Promise<string> {
    const userId = uuidv7();
    const organizerId = uuidv7();
    const id = uuidv7();
    const at = new Date();
    await prisma.user.create({
      data: { id: userId, email: `o-${userId}@exemplo.com`, name: "Ana", createdAt: at },
    });
    await prisma.organizerProfile.create({
      data: {
        id: organizerId,
        userId,
        displayName: "Ana",
        slug: `ana-${id.slice(-6)}`,
        createdAt: at,
      },
    });
    await prisma.event.create({
      data: {
        id,
        organizerId,
        slug: `forro-${id.slice(-6)}`,
        title: "Noite de forró",
        status: "PUBLISHED",
        startsAt: new Date(at.getTime() + 7 * 86_400_000),
        endsAt: new Date(at.getTime() + 7 * 86_400_000 + 3_600_000),
        timezone: "America/Sao_Paulo",
        venueName: "Circo Voador",
        venueAddress: "Rua dos Arcos, s/n",
        venueCity: "Rio de Janeiro",
        venueState: "RJ",
        imageKey: `events/${id}/${uuidv7()}.webp`,
        imageAlt: "Pista cheia",
        imageWidth: 2400,
        imageHeight: 1350,
        imageBlurDataUrl: "data:image/webp;base64,AA==",
        publishedAt: at,
        createdAt: at,
      },
    });
    return id;
  }

  beforeAll(async () => {
    infrastructure = await startInfrastructure({ storage: true });
    if (!infrastructure.storage) throw new Error("storage not started");
    testApp = await createTestApp({
      env: {
        DATABASE_URL: infrastructure.databaseUrl,
        REDIS_URL: infrastructure.redisUrl,
        ...infrastructure.storage.env,
      },
    });
    prisma = testApp.app.get(PrismaService);
    s3 = createS3Client(testApp.config.storage);
    storage = new S3ObjectStorage(s3, testApp.config.storage.bucket);
    await setUpBucket(s3, testApp.config.storage.bucket, TEST_WEB_ORIGIN);
  }, 180_000);

  afterAll(async () => {
    s3.destroy();
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("publishes the demo events on the storefront, flagged and credited", async () => {
    const result = await seedDemo(deps());
    expect(result).toEqual({ events: DEMO_EVENTS.length, photosFetched: DEMO_EVENTS.length });

    const list = catalogEventListSchema.parse((await api().get("/api/v1/events").expect(200)).body);
    expect(list.data.map((event) => event.slug).sort()).toEqual(
      DEMO_EVENTS.map((event) => event.slug).sort(),
    );
    expect(list.data.every((event) => event.isDemo && event.priceFrom !== null)).toBe(true);

    for (const demo of DEMO_EVENTS) {
      const response = await api().get(`/api/v1/events/${demo.slug}`).expect(200);
      const detail = catalogEventDetailSchema.parse(response.body);
      expect(detail).toMatchObject({
        title: demo.title,
        status: "PUBLISHED",
        isDemo: true,
        organizer: { name: "Vira Demonstração" },
        image: { alt: demo.photo.alt, width: 2400, height: 1600, credit: demo.photo.credit },
      });
      expect(detail.ticketTypes.map((ticketType) => ticketType.name)).toEqual(
        demo.ticketTypes.map((ticketType) => ticketType.name),
      );
      expect(detail.descriptionHtml).toContain("<p>");
      const served = await fetch(detail.image.url);
      expect(served.headers.get("content-type")).toBe("image/webp");
    }
  });

  it("runs again without duplicating anything or downloading the photos again", async () => {
    const before = await counts();
    expect(before).toEqual({
      events: DEMO_EVENTS.length,
      ticketTypes: DEMO_EVENTS.reduce((sum, event) => sum + event.ticketTypes.length, 0),
      users: 1,
      organizers: 1,
    });
    fetched.length = 0;

    expect(await seedDemo(deps())).toEqual({ events: DEMO_EVENTS.length, photosFetched: 0 });
    expect(await counts()).toEqual(before);
    expect(fetched).toEqual([]);
  });

  it("downloads a photo again when its picture is missing from the bucket", async () => {
    const [first] = DEMO_EVENTS;
    if (!first) throw new Error("no demo events");
    const row = await prisma.event.findUniqueOrThrow({ where: { slug: first.slug } });
    await storage.delete([row.imageKey ?? ""]);
    fetched.length = 0;

    expect((await seedDemo(deps())).photosFetched).toBe(1);
    expect(fetched).toEqual([first.photo.sourceUrl]);
    expect(await storage.stat(row.imageKey ?? "")).not.toBeNull();
  });

  it("puts a canceled demo event back on sale", async () => {
    const [first] = DEMO_EVENTS;
    if (!first) throw new Error("no demo events");
    await prisma.event.update({
      where: { slug: first.slug },
      data: { status: "CANCELED", canceledAt: new Date(), cancelReason: "Teste de cancelamento" },
    });
    await seedDemo(deps());
    expect(await prisma.event.findUniqueOrThrow({ where: { slug: first.slug } })).toMatchObject({
      status: "PUBLISHED",
      canceledAt: null,
      cancelReason: null,
    });
  });

  it("resets only the demo data, pictures included", async () => {
    const otherId = await insertOtherEvent();
    const keys = (await prisma.event.findMany({ where: { isDemo: true } })).map(
      (event) => event.imageKey ?? "",
    );

    expect(await resetDemo({ prisma, storage })).toEqual({ events: DEMO_EVENTS.length });

    expect(await counts()).toEqual({ events: 0, ticketTypes: 0, users: 0, organizers: 0 });
    expect(await prisma.event.count({ where: { id: otherId } })).toBe(1);
    for (const key of keys) expect(await storage.stat(key)).toBeNull();
    const list = catalogEventListSchema.parse((await api().get("/api/v1/events").expect(200)).body);
    expect(list.data.some((event) => event.isDemo)).toBe(false);

    // And it can be seeded again from scratch.
    expect((await seedDemo(deps())).events).toBe(DEMO_EVENTS.length);
    expect((await counts()).events).toBe(DEMO_EVENTS.length);
  });
});
