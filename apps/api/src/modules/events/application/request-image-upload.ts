import { Inject, Injectable } from "@nestjs/common";
import type { RequestImageUpload as RequestImageUploadBody } from "@vira/shared";

import {
  RATE_LIMITER,
  type RateLimiter,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { OBJECT_STORAGE, type ObjectStorage } from "../../../platform/storage/object-storage.js";
import { editRefusal } from "../domain/event.js";
import { UPLOAD_URL_TTL_SECONDS, uploadObjectKey } from "../domain/event-image.js";
import { EventNotFoundError, InvalidTransitionError } from "./errors.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { EVENT_REPOSITORY, type EventRepository } from "./ports/event-repository.js";
import {
  MEDIA_UPLOAD_REPOSITORY,
  type MediaUploadRepository,
} from "./ports/media-upload-repository.js";
import { EVENTS_RATE_LIMITS } from "./rate-limits.js";

export interface IssuedUpload {
  readonly uploadId: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

/**
 * First step of a new picture: a pre-signed `PUT` URL for one file of the declared type
 * and exact size, valid for 5 minutes, at a key the server makes (docs/SECURITY_MODEL.md,
 * "Upload"). The file goes straight from the browser to the private bucket; nothing is
 * shown until the confirmation (AttachEventImage) checks it.
 */
@Injectable()
export class RequestImageUpload {
  constructor(
    @Inject(EVENT_REPOSITORY) private readonly events: EventRepository,
    @Inject(MEDIA_UPLOAD_REPOSITORY) private readonly uploads: MediaUploadRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly scope: OrganizerScope,
  ) {}

  /**
   * @throws EventNotFoundError when there is no such event or it is someone else's.
   * @throws InvalidTransitionError when the event can no longer change.
   * @throws RateLimitExceededError past the account's budget of URLs.
   */
  async execute(
    caller: Caller,
    eventId: string,
    body: RequestImageUploadBody,
  ): Promise<IssuedUpload> {
    const organizerId = await this.scope.organizerIdOf(caller);
    const now = this.clock.now();
    const event = await this.events.findOwned(eventId, organizerId);
    if (!event) throw new EventNotFoundError();
    const refusal = editRefusal(event, now);
    if (refusal) throw new InvalidTransitionError(refusal);

    const budget = await this.limiter.hit(EVENTS_RATE_LIMITS.imageUploadAccount, caller.id);
    if (!budget.allowed) throw new RateLimitExceededError(budget);

    const uploadId = this.ids.next();
    const objectKey = uploadObjectKey(eventId, uploadId, body.contentType);
    const expiresAt = new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000);
    await this.uploads.create({
      id: uploadId,
      ownerId: organizerId,
      eventId,
      objectKey,
      contentType: body.contentType,
      sizeBytes: body.sizeBytes,
      expiresAt,
      createdAt: now,
    });
    const presigned = await this.storage.presignUpload(objectKey, {
      contentType: body.contentType,
      contentLength: body.sizeBytes,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });
    return { uploadId, url: presigned.url, headers: presigned.headers, expiresAt };
  }
}
