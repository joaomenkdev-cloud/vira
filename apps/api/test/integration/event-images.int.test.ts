import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { organizerEventSchema, imageUploadSchema, problemDetailsSchema } from "@vira/shared";
import sharp from "sharp";
import request, { type Response } from "supertest";
import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EventsJobsModule } from "../../src/modules/events/events.module.js";
import { SweepMediaUploads } from "../../src/modules/events/application/sweep-media-uploads.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { problemTypeUri, type ProblemType } from "../../src/platform/errors/problem-types.js";
import { CLOCK } from "../../src/platform/runtime/runtime.js";
import { AccessTokens } from "../../src/platform/security/access-token.js";
import { setUpBucket } from "../../src/platform/storage/bucket-setup.js";
import { createS3Client } from "../../src/platform/storage/s3-object-storage.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const clock = { current: new Date("2026-10-18T12:00:00Z"), now: () => clock.current };

const draft = {
  title: "Noite de forró no Circo",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00Z",
  timezone: "America/Sao_Paulo",
  venue: {
    name: "Circo Voador",
    address: "Rua dos Arcos, s/n",
    city: "Rio de Janeiro",
    state: "RJ",
  },
};

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

/** A camera-like JPEG: GPS and author in its EXIF, taken sideways. */
function cameraPhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 1300, height: 2000, channels: 3, background: { r: 30, g: 30, b: 30 } },
  })
    .withMetadata({
      orientation: 6,
      exif: {
        IFD0: { Artist: "Fulana de Tal" },
        IFD3: { GPSLatitudeRef: "S", GPSLatitude: "22/1 54/1 0/1" },
      },
    })
    .jpeg()
    .toBuffer();
}

describe.skipIf(!dockerAvailable)("event pictures (PostgreSQL + S3)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;
  const api = () => request(testApp.app.getHttpServer());
  let s3: ReturnType<typeof createS3Client>;
  let bucket: string;

  async function exists(key: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      throw error;
    }
  }

  async function organizer() {
    const userId = uuidv7();
    await prisma.user.create({
      data: {
        id: userId,
        email: `o-${userId}@exemplo.com`,
        name: "Organizadora",
        role: "ORGANIZER",
        emailVerifiedAt: clock.current,
        createdAt: clock.current,
      },
    });
    await prisma.organizerProfile.create({
      data: {
        id: uuidv7(),
        userId,
        displayName: "Coletivo",
        slug: `coletivo-${userId.slice(-12)}`,
        createdAt: clock.current,
      },
    });
    const { token } = testApp.app
      .get(AccessTokens)
      .issue({ sub: userId, role: "ORGANIZER", sid: uuidv7() });
    const auth = `Bearer ${token}`;
    return {
      get: (path: string) => api().get(`/api/v1${path}`).set("Authorization", auth),
      post: (path: string, body: object = {}) =>
        api().post(`/api/v1${path}`).set("Authorization", auth).send(body),
      delete: (path: string) => api().delete(`/api/v1${path}`).set("Authorization", auth),
    };
  }
  type Organizer = Awaited<ReturnType<typeof organizer>>;

  async function createDraft(owner: Organizer) {
    const response = await owner.post("/organizer/events", draft).expect(201);
    return organizerEventSchema.parse(response.body);
  }

  async function uploadUrl(owner: Organizer, eventId: string, file: Buffer, type = "image/jpeg") {
    const response = await owner
      .post(`/organizer/events/${eventId}/image/upload-url`, {
        contentType: type,
        sizeBytes: file.length,
      })
      .expect(201);
    return imageUploadSchema.parse(response.body);
  }

  /** What the browser does with the URL. */
  function put(url: string, body: Buffer, headers: Record<string, string>) {
    return fetch(url, { method: "PUT", body, headers });
  }

  async function attach(owner: Organizer, eventId: string, file: Buffer, alt = "Pista cheia") {
    const issued = await uploadUrl(owner, eventId, file);
    expect((await put(issued.url, file, issued.headers)).status).toBe(200);
    const response = await owner
      .post(`/organizer/events/${eventId}/image`, { uploadId: issued.uploadId, alt })
      .expect(200);
    return { issued, event: organizerEventSchema.parse(response.body) };
  }

  beforeAll(async () => {
    infrastructure = await startInfrastructure({ storage: true });
    const storage = infrastructure.storage;
    if (!storage) throw new Error("storage not started");
    testApp = await createTestApp({
      env: {
        DATABASE_URL: infrastructure.databaseUrl,
        REDIS_URL: infrastructure.redisUrl,
        ...storage.env,
      },
      imports: [EventsJobsModule],
      override: (builder) => builder.overrideProvider(CLOCK).useValue(clock),
    });
    prisma = testApp.app.get(PrismaService);
    s3 = createS3Client(testApp.config.storage);
    bucket = testApp.config.storage.bucket;
    await setUpBucket(s3, bucket, TEST_WEB_ORIGIN);
  }, 180_000);

  afterAll(async () => {
    s3.destroy();
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("takes a photo from the browser to a published event, without its EXIF", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    await ana.post(`/organizer/events/${event.id}/ticket-types`, {
      name: "Pista",
      priceCents: 8000,
      capacity: 100,
    });
    const photo = await cameraPhoto();
    const { issued, event: withImage } = await attach(
      ana,
      event.id,
      photo,
      " Pista cheia sob a lona ",
    );

    expect(withImage.image).toMatchObject({
      alt: "Pista cheia sob a lona",
      // Turned upright: the sideways 1300 × 2000 file is a 2000 × 1300 picture.
      width: 2000,
      height: 1300,
      blurDataUrl: expect.stringMatching(/^data:image\/webp;base64,/) as string,
    });
    const served = await fetch(withImage.image?.url ?? "");
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 2000, height: 1300 });
    expect(metadata.exif).toBeUndefined();

    // Only a signed address of the picture is shown; the original is gone from the bucket.
    expect(Object.keys(withImage.image ?? {}).sort()).toEqual([
      "alt",
      "blurDataUrl",
      "height",
      "url",
      "width",
    ]);
    const upload = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: issued.uploadId } });
    expect(upload).toMatchObject({ status: "CONFIRMED", eventId: event.id });
    expect(await exists(upload.objectKey)).toBe(false);
    expect(await exists(upload.imageKey ?? "")).toBe(true);

    const published = await ana.post(`/organizer/events/${event.id}/publish`).expect(200);
    expect(organizerEventSchema.parse(published.body).status).toBe("PUBLISHED");
  });

  it("is refused by the storage when the file is not the one signed for", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const photo = await cameraPhoto();
    const issued = await uploadUrl(ana, event.id, photo);

    const otherType = await put(issued.url, photo, { "Content-Type": "image/png" });
    expect(otherType.status).toBe(403);
    const larger = await put(issued.url, Buffer.concat([photo, Buffer.alloc(1)]), issued.headers);
    expect(larger.status).toBe(403);
    const html = await put(issued.url, Buffer.from("<script>alert(1)</script>"), {
      "Content-Type": "text/html",
    });
    expect(html.status).toBe(403);
    const upload = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: issued.uploadId } });
    expect(await exists(upload.objectKey)).toBe(false);
  });

  it("answers the browser's CORS preflight for the web's origin only", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const issued = await uploadUrl(ana, event.id, await cameraPhoto());
    const preflight = (origin: string) =>
      fetch(issued.url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
    const ours = await preflight(TEST_WEB_ORIGIN);
    expect(ours.headers.get("access-control-allow-origin")).toBe(TEST_WEB_ORIGIN);
    const theirs = await preflight("https://evil.example");
    expect(theirs.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("refuses a fake picture with 422, spends the upload and deletes the file", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const fake = Buffer.from("<?php system($_GET['c']); ?> isto não é uma foto");
    const issued = await uploadUrl(ana, event.id, fake);
    expect((await put(issued.url, fake, issued.headers)).status).toBe(200);

    const confirm = () =>
      ana.post(`/organizer/events/${event.id}/image`, { uploadId: issued.uploadId, alt: "Pista" });
    const refused = await confirm().expect(422);
    expectProblem(refused, "invalid-image");
    expect(problemDetailsSchema.parse(refused.body).detail).toContain("não é uma imagem");

    const upload = await prisma.mediaUpload.findUniqueOrThrow({ where: { id: issued.uploadId } });
    expect(upload.status).toBe("REJECTED");
    expect(await exists(upload.objectKey)).toBe(false);
    expectProblem(await confirm().expect(404), "not-found");
    const after = await ana.get(`/organizer/events/${event.id}`).expect(200);
    expect(organizerEventSchema.parse(after.body).image).toBeNull();
  });

  it("refuses a real picture below the minimum size", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const thumbnail = await sharp({
      create: { width: 640, height: 360, channels: 3, background: "#d92d3a" },
    })
      .webp()
      .toBuffer();
    const issued = await uploadUrl(ana, event.id, thumbnail, "image/webp");
    expect((await put(issued.url, thumbnail, issued.headers)).status).toBe(200);
    const refused = await ana
      .post(`/organizer/events/${event.id}/image`, { uploadId: issued.uploadId, alt: "Pista" })
      .expect(422);
    expect(problemDetailsSchema.parse(refused.body).detail).toContain("1200 × 600");
  });

  it("keeps the upload pending while the file has not arrived", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const photo = await cameraPhoto();
    const issued = await uploadUrl(ana, event.id, photo);
    const confirm = () =>
      ana.post(`/organizer/events/${event.id}/image`, { uploadId: issued.uploadId, alt: "Pista" });

    expectProblem(await confirm().expect(422), "invalid-image");
    expect((await put(issued.url, photo, issued.headers)).status).toBe(200);
    await confirm().expect(200);
  });

  it("never lets an organizer touch another's event or upload (404 like a missing one)", async () => {
    const ana = await organizer();
    const bia = await organizer();
    const anaEvent = await createDraft(ana);
    const biaEvent = await createDraft(bia);
    const photo = await cameraPhoto();
    const issued = await uploadUrl(ana, anaEvent.id, photo);
    await put(issued.url, photo, issued.headers);

    expectProblem(
      await bia
        .post(`/organizer/events/${anaEvent.id}/image/upload-url`, {
          contentType: "image/jpeg",
          sizeBytes: 10,
        })
        .expect(404),
      "not-found",
    );
    await bia
      .post(`/organizer/events/${anaEvent.id}/image`, { uploadId: issued.uploadId, alt: "Pista" })
      .expect(404);
    await bia
      .post(`/organizer/events/${biaEvent.id}/image`, { uploadId: issued.uploadId, alt: "Pista" })
      .expect(404);
    // Ana's upload is still hers to confirm.
    await ana
      .post(`/organizer/events/${anaEvent.id}/image`, { uploadId: issued.uploadId, alt: "Pista" })
      .expect(200);
  });

  it("sweeps replaced pictures, abandoned uploads and pictures of deleted drafts", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const photo = await cameraPhoto();
    const first = await attach(ana, event.id, photo, "Primeira");
    const second = await attach(ana, event.id, photo, "Segunda");
    const abandoned = await uploadUrl(ana, event.id, photo);
    await put(abandoned.url, photo, abandoned.headers);
    const doomed = await createDraft(ana);
    const ofDeleted = await attach(ana, doomed.id, photo, "Rascunho");
    await ana.delete(`/organizer/events/${doomed.id}`).expect(204);

    const keyOf = async (uploadId: string) =>
      (await prisma.mediaUpload.findUniqueOrThrow({ where: { id: uploadId } })).imageKey ?? "";
    const firstKey = await keyOf(first.issued.uploadId);
    const secondKey = await keyOf(second.issued.uploadId);
    const deletedKey = await keyOf(ofDeleted.issued.uploadId);
    const abandonedKey = (
      await prisma.mediaUpload.findUniqueOrThrow({ where: { id: abandoned.uploadId } })
    ).objectKey;
    const sweep = testApp.app.get(SweepMediaUploads);

    await sweep.execute();
    expect(await exists(firstKey)).toBe(false);
    expect(await exists(deletedKey)).toBe(false);
    expect(await exists(secondKey)).toBe(true);
    expect(await exists(abandonedKey)).toBe(true);

    clock.current = new Date(clock.current.getTime() + 21 * 60_000);
    await sweep.execute();
    expect(await exists(abandonedKey)).toBe(false);
    expect(await exists(secondKey)).toBe(true);
    const left = await prisma.mediaUpload.findMany({ where: { eventId: event.id } });
    expect(left.map((row) => row.id)).toEqual([second.issued.uploadId]);
  });

  it("refuses in the database what the API never writes", async () => {
    const ana = await organizer();
    const event = await createDraft(ana);
    const profile = await prisma.organizerProfile.findFirstOrThrow({
      where: { events: { some: { id: event.id } } },
    });
    const base = {
      ownerId: profile.id,
      eventId: event.id,
      contentType: "image/jpeg",
      sizeBytes: 10,
      expiresAt: clock.current,
      createdAt: clock.current,
    };
    const id = uuidv7();
    await expect(
      prisma.mediaUpload.create({ data: { ...base, id, objectKey: "../../etc/passwd" } }),
    ).rejects.toThrow(/media_uploads_object_key_format/);
    await expect(
      prisma.mediaUpload.create({
        data: { ...base, id, objectKey: `uploads/${event.id}/${id}.svg` },
      }),
    ).rejects.toThrow(/media_uploads_object_key_format/);
    await expect(
      prisma.mediaUpload.create({
        data: {
          ...base,
          id,
          objectKey: `uploads/${event.id}/${id}.jpg`,
          contentType: "image/svg+xml",
        },
      }),
    ).rejects.toThrow(/media_uploads_content_type/);
    await expect(
      prisma.mediaUpload.create({
        data: { ...base, id, objectKey: `uploads/${event.id}/${id}.jpg`, sizeBytes: 5_242_881 },
      }),
    ).rejects.toThrow(/media_uploads_size/);
    await expect(
      prisma.mediaUpload.create({
        data: { ...base, id, objectKey: `uploads/${event.id}/${id}.jpg`, status: "CONFIRMED" },
      }),
    ).rejects.toThrow(/media_uploads_confirmed/);
    await expect(
      prisma.event.update({
        where: { id: event.id },
        data: { imageKey: `events/${event.id}/x.webp`, imageAlt: "Pista" },
      }),
    ).rejects.toThrow(/events_image_details/);
  });
});
