import { Module } from "@nestjs/common";

import { AuditLog } from "./application/audit-log.js";
import { AUDIT_LOG_REPOSITORY } from "./application/ports/audit-log-repository.js";
import { PrismaAuditLogRepository } from "./infra/prisma-audit-log-repository.js";

@Module({
  providers: [AuditLog, { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository }],
  exports: [AuditLog],
})
export class AuditModule {}
