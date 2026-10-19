import { Inject, Injectable } from "@nestjs/common";
import type { OrganizerEvent } from "@vira/shared";

import { OBJECT_STORAGE, type ObjectStorage } from "../../../platform/storage/object-storage.js";
import type { Event } from "../domain/event.js";
import { eventBody } from "./bodies.js";

/** How long the picture's signed address in a response works. */
const IMAGE_URL_TTL_SECONDS = 60 * 60;

/**
 * Builds the organizer's view of an event, with a signed address of its picture: the
 * bucket is private, and signing is local (no call to the storage).
 */
@Injectable()
export class EventPresenter {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  async event(event: Event): Promise<OrganizerEvent> {
    const imageUrl = event.image
      ? await this.storage.presignDownload(event.image.key, IMAGE_URL_TTL_SECONDS)
      : null;
    return eventBody(event, imageUrl);
  }
}
