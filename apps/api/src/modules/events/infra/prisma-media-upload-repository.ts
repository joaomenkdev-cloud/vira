import { Injectable } from "@nestjs/common";
import type { EventImageContentType } from "@vira/shared";

import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  DiscardedUpload,
  MediaUpload,
  MediaUploadRepository,
  NewMediaUpload,
} from "../application/ports/media-upload-repository.js";

/** Uploads of event pictures in PostgreSQL; status changes are conditional writes. */
@Injectable()
export class PrismaMediaUploadRepository implements MediaUploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(upload: NewMediaUpload): Promise<void> {
    await this.prisma.mediaUpload.create({ data: upload });
  }

  async findOwned(uploadId: string, ownerId: string, eventId: string): Promise<MediaUpload | null> {
    const row = await this.prisma.mediaUpload.findFirst({
      where: { id: uploadId, ownerId, eventId },
    });
    return row && { ...row, contentType: row.contentType as EventImageContentType };
  }

  async confirm(
    uploadId: string,
    change: { readonly imageKey: string; readonly confirmedAt: Date },
    tx?: TransactionContext,
  ): Promise<boolean> {
    const { count } = await clientFor(this.prisma, tx).mediaUpload.updateMany({
      where: { id: uploadId, status: "PENDING" },
      data: { status: "CONFIRMED", imageKey: change.imageKey, confirmedAt: change.confirmedAt },
    });
    return count === 1;
  }

  async reject(uploadId: string): Promise<void> {
    await this.prisma.mediaUpload.updateMany({
      where: { id: uploadId, status: "PENDING" },
      data: { status: "REJECTED" },
    });
  }

  async listDiscarded(expiredBefore: Date, limit: number): Promise<DiscardedUpload[]> {
    const rows = await this.prisma.$queryRaw<
      { id: string; object_key: string; image_key: string | null }[]
    >`
      SELECT m."id", m."object_key", m."image_key" FROM "media_uploads" m
       WHERE (m."status" IN ('PENDING', 'REJECTED') AND m."expires_at" < ${expiredBefore})
          OR (m."status" = 'CONFIRMED' AND NOT EXISTS (
                SELECT 1 FROM "events" e
                 WHERE e."id" = m."event_id" AND e."image_key" = m."image_key"))
       ORDER BY m."created_at"
       LIMIT ${limit}`;
    return rows.map((row) => ({
      id: row.id,
      keys: row.image_key ? [row.object_key, row.image_key] : [row.object_key],
    }));
  }

  async deleteMany(uploadIds: readonly string[]): Promise<void> {
    await this.prisma.mediaUpload.deleteMany({ where: { id: { in: [...uploadIds] } } });
  }
}
