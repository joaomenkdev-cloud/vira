import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it } from "vitest";

import type {
  TransactionContext,
  TransactionRunner,
} from "../../../platform/database/transaction.js";
import type { RateLimiter, RateLimitRule } from "../../../platform/rate-limit/rate-limiter.js";
import { RateLimitExceededError } from "../../../platform/rate-limit/rate-limiter.js";
import type { OrganizerProfiles } from "../../users/application/public-api.js";
import { AttachEventImage } from "./attach-event-image.js";
import { CreateEvent } from "./create-event.js";
import {
  EventNotFoundError,
  InvalidTransitionError,
  NotOrganizerError,
  UnusableUploadError,
  UploadNotFoundError,
} from "./errors.js";
import { InMemoryEvents } from "./in-memory-events.fakes.js";
import { FakeImageProcessor, InMemoryStorage, InMemoryUploads } from "./in-memory-images.fakes.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { RequestImageUpload } from "./request-image-upload.js";
import { SweepMediaUploads } from "./sweep-media-uploads.js";

const ana: Caller = { id: "0192a0e4-0000-7000-8000-00000000a0a0", role: "ORGANIZER" };
const bia: Caller = { id: "0192a0e4-0000-7000-8000-00000000b0b0", role: "ORGANIZER" };
const semPerfil: Caller = { id: "0192a0e4-0000-7000-8000-00000000c0c0", role: "ADMIN" };

const draft = {
  title: "Noite de forró no Circo",
  descriptionMd: "",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00Z",
  timezone: "America/Sao_Paulo",
};
const jpeg = { contentType: "image/jpeg" as const, sizeBytes: 4 };
const file = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const silentLogger = { info: () => undefined, warn: () => undefined } as unknown as PinoLogger;

function setup() {
  const clock = { current: new Date("2026-10-18T12:00:00Z"), now: () => clock.current };
  const advance = (ms: number) => {
    clock.current = new Date(clock.current.getTime() + ms);
  };
  let n = 0;
  const ids = { next: () => `0192a0e4-0000-7000-8000-${String(++n).padStart(12, "0")}` };
  const events = new InMemoryEvents();
  const uploads = new InMemoryUploads(events);
  const storage = new InMemoryStorage();
  const processor = new FakeImageProcessor();
  const profiles = new Map([
    [ana.id, "0192a0e4-0000-7000-8000-0000000000a1"],
    [bia.id, "0192a0e4-0000-7000-8000-0000000000b1"],
  ]);
  const scope = new OrganizerScope({
    profileIdOf: (userId: string) => Promise.resolve(profiles.get(userId) ?? null),
  } as OrganizerProfiles);
  const transactions: TransactionRunner = {
    run: <T>(work: (tx: TransactionContext) => Promise<T>) => work({} as TransactionContext),
  };
  const hits = new Map<string, number>();
  const limiter: RateLimiter = {
    hit: (rule: RateLimitRule, subject: string) => {
      const count = (hits.get(`${rule.name}:${subject}`) ?? 0) + 1;
      hits.set(`${rule.name}:${subject}`, count);
      return Promise.resolve({
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        resetSeconds: rule.windowSeconds,
      });
    },
  };
  const create = new CreateEvent(events, { render: (md) => md }, clock, ids, scope);
  const requestUpload = new RequestImageUpload(
    events,
    uploads,
    storage,
    limiter,
    clock,
    ids,
    scope,
  );
  const attach = new AttachEventImage(
    events,
    uploads,
    storage,
    processor,
    transactions,
    clock,
    ids,
    scope,
    silentLogger,
  );
  const sweep = new SweepMediaUploads(uploads, storage, clock);

  /** The whole flow as the web will run it: URL, PUT, confirmation. */
  async function upload(caller: Caller, eventId: string, alt = "Pista cheia sob a lona") {
    const issued = await requestUpload.execute(caller, eventId, jpeg);
    expect(storage.browserPut(issued.url, file, "image/jpeg")).toBe(true);
    return attach.execute(caller, eventId, { uploadId: issued.uploadId, alt });
  }

  return {
    clock,
    advance,
    events,
    uploads,
    storage,
    processor,
    create,
    requestUpload,
    attach,
    sweep,
    upload,
  };
}

describe("RequestImageUpload", () => {
  it("issues a 5-minute URL for an object key of the server's making", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, event.id, jpeg);

    expect(issued.expiresAt).toEqual(new Date("2026-10-18T12:05:00Z"));
    expect(issued.headers).toEqual({ "Content-Type": "image/jpeg" });
    const row = s.uploads.rows.get(issued.uploadId);
    expect(row).toMatchObject({
      status: "PENDING",
      eventId: event.id,
      ownerId: "0192a0e4-0000-7000-8000-0000000000a1",
      objectKey: `uploads/${event.id}/${issued.uploadId}.jpg`,
      sizeBytes: 4,
    });
    expect(issued.url).toContain(row?.objectKey);
  });

  it("signs the type and the size: the storage refuses another file", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, event.id, jpeg);
    expect(s.storage.browserPut(issued.url, file, "image/png")).toBe(false);
    expect(s.storage.browserPut(issued.url, Buffer.alloc(5), "image/jpeg")).toBe(false);
    expect(s.storage.objects.size).toBe(0);
  });

  it("answers not found for someone else's event and refuses accounts without a profile", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    await expect(s.requestUpload.execute(bia, event.id, jpeg)).rejects.toThrow(EventNotFoundError);
    await expect(s.requestUpload.execute(semPerfil, event.id, jpeg)).rejects.toThrow(
      NotOrganizerError,
    );
    expect(s.uploads.rows.size).toBe(0);
  });

  it("refuses events that can no longer change", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    s.clock.current = new Date("2026-12-06T04:00:00Z");
    await expect(s.requestUpload.execute(ana, event.id, jpeg)).rejects.toThrow(
      InvalidTransitionError,
    );
  });

  it("limits each account to 20 URLs an hour", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    for (let i = 0; i < 20; i++) await s.requestUpload.execute(ana, event.id, jpeg);
    await expect(s.requestUpload.execute(ana, event.id, jpeg)).rejects.toThrow(
      RateLimitExceededError,
    );
    expect(s.uploads.rows.size).toBe(20);
  });
});

describe("AttachEventImage", () => {
  it("makes the processed picture the event's, and deletes the original", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const updated = await s.upload(ana, event.id);

    expect(updated.image).toEqual({
      key: expect.stringMatching(new RegExp(`^events/${event.id}/[0-9a-f-]{36}\\.webp$`)) as string,
      alt: "Pista cheia sob a lona",
      width: 2400,
      height: 1600,
      blurDataUrl: "data:image/webp;base64,UklGRg==",
    });
    const [upload] = [...s.uploads.rows.values()];
    expect(upload).toMatchObject({ status: "CONFIRMED", imageKey: updated.image?.key });
    // Only the re-encoded picture is left in the bucket.
    expect([...s.storage.objects.keys()]).toEqual([updated.image?.key]);
    expect(s.storage.objects.get(updated.image?.key ?? "")?.contentType).toBe("image/webp");
  });

  it("does not use an upload twice", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, event.id, jpeg);
    s.storage.browserPut(issued.url, file, "image/jpeg");
    await s.attach.execute(ana, event.id, { uploadId: issued.uploadId, alt: "Pista" });
    await expect(
      s.attach.execute(ana, event.id, { uploadId: issued.uploadId, alt: "Pista" }),
    ).rejects.toThrow(UploadNotFoundError);
  });

  it("does not take an upload of another event, nor of another organizer", async () => {
    const s = setup();
    const first = await s.create.execute(ana, draft);
    const second = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, first.id, jpeg);
    s.storage.browserPut(issued.url, file, "image/jpeg");

    await expect(
      s.attach.execute(ana, second.id, { uploadId: issued.uploadId, alt: "Pista" }),
    ).rejects.toThrow(UploadNotFoundError);
    const biaEvent = await s.create.execute(bia, draft);
    await expect(
      s.attach.execute(bia, biaEvent.id, { uploadId: issued.uploadId, alt: "Pista" }),
    ).rejects.toThrow(UploadNotFoundError);
    await expect(
      s.attach.execute(bia, first.id, { uploadId: issued.uploadId, alt: "Pista" }),
    ).rejects.toThrow(EventNotFoundError);
    expect(s.processor.calls).toBe(0);
  });

  it("waits for a file that has not arrived, without spending the upload", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, event.id, jpeg);
    const confirm = () =>
      s.attach.execute(ana, event.id, { uploadId: issued.uploadId, alt: "Pista" });

    await expect(confirm()).rejects.toThrow(new UnusableUploadError("not-received"));
    s.storage.browserPut(issued.url, file, "image/jpeg");
    await expect(confirm()).resolves.toMatchObject({ image: { alt: "Pista" } });
  });

  it("spends the upload and deletes a file that is not a usable picture", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, event.id, jpeg);
    s.storage.browserPut(issued.url, file, "image/jpeg");
    s.processor.refuseWith = "type-mismatch";

    const confirm = () =>
      s.attach.execute(ana, event.id, { uploadId: issued.uploadId, alt: "Pista" });
    await expect(confirm()).rejects.toThrow(new UnusableUploadError("type-mismatch"));
    expect(s.uploads.rows.get(issued.uploadId)?.status).toBe("REJECTED");
    expect(s.storage.objects.size).toBe(0);
    s.processor.refuseWith = undefined;
    await expect(confirm()).rejects.toThrow(UploadNotFoundError);
    expect(
      (await s.events.findOwned(event.id, "0192a0e4-0000-7000-8000-0000000000a1"))?.image,
    ).toBe(null);
  });

  it("refuses a stored object of another size than the declared one", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const issued = await s.requestUpload.execute(ana, event.id, jpeg);
    // As if the storage had ignored the signed length.
    const key = s.uploads.rows.get(issued.uploadId)?.objectKey ?? "";
    await s.storage.write(key, Buffer.alloc(10), { contentType: "image/jpeg" });

    await expect(
      s.attach.execute(ana, event.id, { uploadId: issued.uploadId, alt: "Pista" }),
    ).rejects.toThrow(new UnusableUploadError("size-mismatch"));
    expect(s.processor.calls).toBe(0);
  });

  it("takes a confirmation shortly after the URL expired, but not much later", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const late = await s.requestUpload.execute(ana, event.id, jpeg);
    const tooLate = await s.requestUpload.execute(ana, event.id, jpeg);
    s.storage.browserPut(late.url, file, "image/jpeg");
    s.storage.browserPut(tooLate.url, file, "image/jpeg");

    s.advance(5 * 60_000 + 15 * 60_000);
    await expect(
      s.attach.execute(ana, event.id, { uploadId: late.uploadId, alt: "Pista" }),
    ).resolves.toMatchObject({ image: { alt: "Pista" } });
    s.advance(1);
    await expect(
      s.attach.execute(ana, event.id, { uploadId: tooLate.uploadId, alt: "Pista" }),
    ).rejects.toThrow(UploadNotFoundError);
  });

  it("replaces the picture of a published event, never of an ended one", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const first = await s.upload(ana, event.id, "Primeira");
    const second = await s.upload(ana, event.id, "Segunda");
    expect(second.image?.key).not.toBe(first.image?.key);
    expect(second.image?.alt).toBe("Segunda");

    const issued = await s.requestUpload.execute(ana, event.id, jpeg);
    s.storage.browserPut(issued.url, file, "image/jpeg");
    s.clock.current = new Date("2026-12-06T03:00:00Z");
    await expect(
      s.attach.execute(ana, event.id, { uploadId: issued.uploadId, alt: "Tarde" }),
    ).rejects.toThrow(InvalidTransitionError);
  });
});

describe("SweepMediaUploads", () => {
  it("deletes what nothing uses: expired, rejected and replaced uploads", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const replaced = await s.upload(ana, event.id, "Antiga");
    const current = await s.upload(ana, event.id, "Atual");
    const abandoned = await s.requestUpload.execute(ana, event.id, jpeg);
    s.storage.browserPut(abandoned.url, file, "image/jpeg");
    const rejected = await s.requestUpload.execute(ana, event.id, jpeg);
    s.storage.browserPut(rejected.url, file, "image/jpeg");
    s.processor.refuseWith = "too-small";
    await expect(
      s.attach.execute(ana, event.id, { uploadId: rejected.uploadId, alt: "Pista" }),
    ).rejects.toThrow(UnusableUploadError);

    // Before the URLs and their grace are over, only the replaced picture can go.
    expect(await s.sweep.execute()).toBe(1);
    expect(s.storage.objects.has(replaced.image?.key ?? "")).toBe(false);
    expect(s.storage.objects.has(current.image?.key ?? "")).toBe(true);

    s.advance(20 * 60_000 + 1);
    expect(await s.sweep.execute()).toBe(2);
    expect([...s.storage.objects.keys()]).toEqual([current.image?.key]);
    expect([...s.uploads.rows.values()].map((row) => row.imageKey)).toEqual([current.image?.key]);
    expect(await s.sweep.execute()).toBe(0);
  });
});
