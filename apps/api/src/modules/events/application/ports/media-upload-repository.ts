import type { EventImageContentType } from "@vira/shared";

import type { TransactionContext } from "../../../../platform/database/transaction.js";

export type UploadStatus = "PENDING" | "CONFIRMED" | "REJECTED";

/** One upload of an event picture (docs/DATA_MODEL.md#media_uploads). */
export interface MediaUpload {
  readonly id: string;
  readonly ownerId: string;
  readonly eventId: string | null;
  /** Where the browser sends the original. */
  readonly objectKey: string;
  readonly contentType: EventImageContentType;
  readonly sizeBytes: number;
  readonly status: UploadStatus;
  /** The re-encoded picture, once confirmed. */
  readonly imageKey: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export type NewMediaUpload = Omit<MediaUpload, "status" | "imageKey">;

/** Objects of an upload that nothing needs anymore, for the sweep to delete. */
export interface DiscardedUpload {
  readonly id: string;
  readonly keys: readonly string[];
}

export interface MediaUploadRepository {
  create(upload: NewMediaUpload): Promise<void>;

  /** The organizer's upload for that event, whatever its status; `null` if it is not theirs. */
  findOwned(uploadId: string, ownerId: string, eventId: string): Promise<MediaUpload | null>;

  /** PENDING → CONFIRMED; `false` if it was no longer pending (a concurrent confirmation). */
  confirm(
    uploadId: string,
    change: { readonly imageKey: string; readonly confirmedAt: Date },
    tx?: TransactionContext,
  ): Promise<boolean>;

  /** PENDING → REJECTED: the file was not an acceptable picture. */
  reject(uploadId: string): Promise<void>;

  /**
   * Uploads whose objects can go: still pending or rejected with their URL expired before
   * `expiredBefore`, and confirmed ones whose picture is no longer their event's (it was
   * replaced, or the event was deleted). At most `limit`.
   */
  listDiscarded(expiredBefore: Date, limit: number): Promise<DiscardedUpload[]>;

  deleteMany(uploadIds: readonly string[]): Promise<void>;
}

export const MEDIA_UPLOAD_REPOSITORY = Symbol("MEDIA_UPLOAD_REPOSITORY");
