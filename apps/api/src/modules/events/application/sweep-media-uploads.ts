import { Inject, Injectable } from "@nestjs/common";

import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { OBJECT_STORAGE, type ObjectStorage } from "../../../platform/storage/object-storage.js";
import { CONFIRMATION_GRACE_MS } from "../domain/event-image.js";
import {
  MEDIA_UPLOAD_REPOSITORY,
  type MediaUploadRepository,
} from "./ports/media-upload-repository.js";

const BATCH = 100;
/** Bounds one run; what is left waits for the next one. */
const MAX_BATCHES = 10;

/**
 * Deletes the objects nothing uses anymore, and their rows (docs/DATA_MODEL.md: "Uploads
 * PENDING vencidos são apagados por job"): files never confirmed once their URL and the
 * confirmation grace are over, rejected ones, and pictures replaced by a newer one or
 * left by a deleted event. Objects go before rows, so a failure leaves the row to retry.
 */
@Injectable()
export class SweepMediaUploads {
  constructor(
    @Inject(MEDIA_UPLOAD_REPOSITORY) private readonly uploads: MediaUploadRepository,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Answers how many uploads it removed. */
  async execute(): Promise<number> {
    const expiredBefore = new Date(this.clock.now().getTime() - CONFIRMATION_GRACE_MS);
    let removed = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const discarded = await this.uploads.listDiscarded(expiredBefore, BATCH);
      if (discarded.length === 0) break;
      await this.storage.delete(discarded.flatMap((upload) => upload.keys));
      await this.uploads.deleteMany(discarded.map((upload) => upload.id));
      removed += discarded.length;
      if (discarded.length < BATCH) break;
    }
    return removed;
  }
}
