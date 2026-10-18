import { Inject, Injectable } from "@nestjs/common";
import { type AttachEventImageRequest, EVENT_IMAGE_MAX_BYTES } from "@vira/shared";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from "../../../platform/database/transaction.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  ObjectTooLargeError,
} from "../../../platform/storage/object-storage.js";
import { type Event, editRefusal } from "../domain/event.js";
import { imageObjectKey, stillConfirmable } from "../domain/event-image.js";
import {
  EventNotFoundError,
  InvalidTransitionError,
  UnusableUploadError,
  UploadNotFoundError,
  type UploadProblem,
} from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";
import {
  IMAGE_PROCESSOR,
  type ImageProcessor,
  InvalidImageError,
  type ProcessedImage,
} from "./ports/image-processor.js";
import {
  type MediaUpload,
  MEDIA_UPLOAD_REPOSITORY,
  type MediaUploadRepository,
} from "./ports/media-upload-repository.js";

/** Served objects never change (each picture has a key of its own): cache them for good. */
const IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";

/**
 * Second step of a new picture: the uploaded file becomes the event's picture, once it
 * proves to be one. The server reads the object (never a URL from the client), checks
 * its size and real format (magic bytes), decodes it, re-encodes it to WebP without
 * metadata and makes the blurred preview. The original is then deleted; the previous
 * picture is left to the upload sweep, which deletes every object nothing points at.
 */
@Injectable()
export class AttachEventImage {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(MEDIA_UPLOAD_REPOSITORY) private readonly uploads: MediaUploadRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(IMAGE_PROCESSOR) private readonly processor: ImageProcessor,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly scope: OrganizerScope,
    @InjectPinoLogger(AttachEventImage.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when the event can no longer change.
   * @throws UploadNotFoundError when the upload is not this event's, was used or expired.
   * @throws UnusableUploadError when the file is missing or is not a usable picture.
   */
  async execute(caller: Caller, eventId: string, body: AttachEventImageRequest): Promise<Event> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    const refusal = editRefusal(event, now);
    if (refusal) throw new InvalidTransitionError(refusal);

    const upload = await this.uploads.findOwned(body.uploadId, organizerId, eventId);
    if (upload?.status !== "PENDING" || !stillConfirmable(upload.expiresAt, now)) {
      throw new UploadNotFoundError();
    }

    const processed = await this.processUpload(upload);
    const imageKey = imageObjectKey(eventId, this.ids.next());
    await this.storage.write(imageKey, processed.data, {
      contentType: processed.contentType,
      cacheControl: IMAGE_CACHE_CONTROL,
    });

    try {
      await this.transactions.run(async (tx) => {
        // Locked like every other change to the event: publication sees the picture or not.
        const locked = await this.events.findOwned(eventId, organizerId, { tx, lock: true });
        if (!locked) throw new EventNotFoundError();
        const lateRefusal = editRefusal(locked, this.clock.now());
        if (lateRefusal) throw new InvalidTransitionError(lateRefusal);
        // A concurrent confirmation of the same upload won: this one gives way.
        const confirmed = await this.uploads.confirm(upload.id, { imageKey, confirmedAt: now }, tx);
        if (!confirmed) throw new UploadNotFoundError();
        await this.events.setImage(
          eventId,
          {
            key: imageKey,
            alt: body.alt,
            width: processed.width,
            height: processed.height,
            blurDataUrl: processed.blurDataUrl,
          },
          tx,
        );
      });
    } catch (error) {
      await this.discard([imageKey]);
      throw error;
    }

    // The original has served its purpose; the sweep catches it if this fails.
    await this.discard([upload.objectKey]);
    const updated = await this.events.findOwned(eventId, organizerId);
    if (!updated) throw new EventNotFoundError();
    return updated;
  }

  /** Reads and checks the uploaded file; a bad one spends the upload and is deleted. */
  private async processUpload(upload: MediaUpload): Promise<ProcessedImage> {
    const stored = await this.storage.stat(upload.objectKey);
    // Not there yet: the upload stays pending, the browser may still send it.
    if (!stored) throw new UnusableUploadError("not-received");
    // The URL signs the length, so this only happens if the storage ignored it.
    if (stored.sizeBytes !== upload.sizeBytes) return this.refuse(upload, "size-mismatch");

    let file: Buffer | null;
    try {
      file = await this.storage.read(upload.objectKey, EVENT_IMAGE_MAX_BYTES);
    } catch (error) {
      if (error instanceof ObjectTooLargeError) return this.refuse(upload, "size-mismatch");
      throw error;
    }
    if (!file) throw new UnusableUploadError("not-received");

    try {
      return await this.processor.process(file, upload.contentType);
    } catch (error) {
      if (error instanceof InvalidImageError) return this.refuse(upload, error.reason);
      throw error;
    }
  }

  private async refuse(upload: MediaUpload, problem: UploadProblem): Promise<never> {
    await this.uploads.reject(upload.id);
    await this.discard([upload.objectKey]);
    this.logger.info({ uploadId: upload.id, problem }, "Image upload rejected");
    throw new UnusableUploadError(problem);
  }

  /** Best effort: an object left behind costs storage, not correctness. */
  private async discard(keys: readonly string[]): Promise<void> {
    try {
      await this.storage.delete(keys);
    } catch (error) {
      this.logger.warn({ err: error }, "Could not delete uploaded objects");
    }
  }
}
