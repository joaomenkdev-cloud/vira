import type {
  ObjectStorage,
  PresignedUpload,
  StoredObject,
} from "../../../platform/storage/object-storage.js";
import { ObjectTooLargeError } from "../../../platform/storage/object-storage.js";
import type { InMemoryEvents } from "./in-memory-events.fakes.js";
import {
  type ImageProcessor,
  type ImageRejection,
  InvalidImageError,
  type ProcessedImage,
} from "./ports/image-processor.js";
import type {
  DiscardedUpload,
  MediaUpload,
  MediaUploadRepository,
  NewMediaUpload,
} from "./ports/media-upload-repository.js";

/** Uploads in memory, with the conditional status changes of the real repository. */
export class InMemoryUploads implements MediaUploadRepository {
  readonly rows = new Map<string, MediaUpload>();

  constructor(private readonly events: InMemoryEvents) {}

  create(upload: NewMediaUpload): Promise<void> {
    this.rows.set(upload.id, { ...upload, status: "PENDING", imageKey: null });
    return Promise.resolve();
  }

  findOwned(uploadId: string, ownerId: string, eventId: string): Promise<MediaUpload | null> {
    const row = this.rows.get(uploadId);
    return Promise.resolve(row?.ownerId === ownerId && row.eventId === eventId ? row : null);
  }

  confirm(uploadId: string, change: { imageKey: string }): Promise<boolean> {
    const row = this.rows.get(uploadId);
    if (row?.status !== "PENDING") return Promise.resolve(false);
    this.rows.set(uploadId, { ...row, status: "CONFIRMED", imageKey: change.imageKey });
    return Promise.resolve(true);
  }

  reject(uploadId: string): Promise<void> {
    const row = this.rows.get(uploadId);
    if (row?.status === "PENDING") this.rows.set(uploadId, { ...row, status: "REJECTED" });
    return Promise.resolve();
  }

  listDiscarded(expiredBefore: Date, limit: number): Promise<DiscardedUpload[]> {
    const discarded = [...this.rows.values()].filter((row) => {
      if (row.status !== "CONFIRMED") return row.expiresAt < expiredBefore;
      const event = row.eventId ? this.events.events.get(row.eventId) : undefined;
      return event?.image?.key !== row.imageKey;
    });
    return Promise.resolve(
      discarded.slice(0, limit).map((row) => ({
        id: row.id,
        keys: row.imageKey ? [row.objectKey, row.imageKey] : [row.objectKey],
      })),
    );
  }

  deleteMany(uploadIds: readonly string[]): Promise<void> {
    for (const id of uploadIds) this.rows.delete(id);
    return Promise.resolve();
  }
}

interface PendingUrl {
  readonly key: string;
  readonly contentType: string;
  readonly contentLength: number;
}

/** A bucket in memory. `browserPut` plays the browser, with the checks of a signed URL. */
export class InMemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  private readonly urls = new Map<string, PendingUrl>();
  deletes: string[] = [];

  presignUpload(
    key: string,
    options: { contentType: string; contentLength: number },
  ): Promise<PresignedUpload> {
    const url = `https://storage.test/${key}?signature=${this.urls.size}`;
    this.urls.set(url, { key, ...options });
    return Promise.resolve({ url, headers: { "Content-Type": options.contentType } });
  }

  presignDownload(key: string): Promise<string> {
    return Promise.resolve(`https://storage.test/${key}?download`);
  }

  /** Answers whether the storage took the file, as a signed URL would. */
  browserPut(url: string, body: Buffer, contentType: string): boolean {
    const signed = this.urls.get(url);
    if (signed?.contentType !== contentType || signed.contentLength !== body.length) return false;
    this.objects.set(signed.key, { body, contentType });
    return true;
  }

  stat(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    return Promise.resolve(object ? { sizeBytes: object.body.length } : null);
  }

  read(key: string, maxBytes: number): Promise<Buffer | null> {
    const object = this.objects.get(key);
    if (object && object.body.length > maxBytes) return Promise.reject(new ObjectTooLargeError());
    return Promise.resolve(object?.body ?? null);
  }

  write(key: string, body: Buffer, options: { contentType: string }): Promise<void> {
    this.objects.set(key, { body, contentType: options.contentType });
    return Promise.resolve();
  }

  delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this.deletes.push(key);
      this.objects.delete(key);
    }
    return Promise.resolve();
  }
}

/** Turns any file into a fixed picture, or refuses it with `refuseWith`. */
export class FakeImageProcessor implements ImageProcessor {
  refuseWith: ImageRejection | undefined;
  calls = 0;

  process(): Promise<ProcessedImage> {
    this.calls++;
    if (this.refuseWith) return Promise.reject(new InvalidImageError(this.refuseWith));
    return Promise.resolve({
      data: Buffer.from("webp"),
      contentType: "image/webp",
      width: 2400,
      height: 1600,
      blurDataUrl: "data:image/webp;base64,UklGRg==",
    });
  }
}
