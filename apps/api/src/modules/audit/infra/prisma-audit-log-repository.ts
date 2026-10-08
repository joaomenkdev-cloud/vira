import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../generated/prisma/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { AuditLogRepository } from "../application/ports/audit-log-repository.js";
import type { AuditEntry } from "../domain/audit-entry.js";

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: entry.id,
        occurredAt: entry.occurredAt,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        requestId: entry.requestId,
        // Shape already validated against the audit catalog, which only allows JSON values.
        metadata: { ...entry.metadata } as Prisma.InputJsonObject,
      },
    });
  }
}
