import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { ApplyRetention } from "./application/apply-retention.js";
import { EraseAccount } from "./application/erase-account.js";
import { ExportAccountData } from "./application/export-account-data.js";
import { PRIVACY_REPOSITORY } from "./application/ports/privacy-repository.js";
import { DataExportController } from "./http/data-export.controller.js";
import { PrismaPrivacyRepository } from "./infra/prisma-privacy-repository.js";
import { RetentionSweeper } from "./infra/retention-sweeper.js";

const persistence = [{ provide: PRIVACY_REPOSITORY, useClass: PrismaPrivacyRepository }];

/**
 * The data subject's rights (V9, docs/PRIVACY.md): the export of the account and its
 * erasure, which `auth` calls once the holder has proved who they are.
 */
@Module({
  imports: [AuditModule],
  controllers: [DataExportController],
  providers: [ExportAccountData, EraseAccount, ...persistence],
  exports: [EraseAccount],
})
export class PrivacyModule {}

/** The retention rules, on a schedule. Imported by the worker (and embedded mode). */
@Module({
  providers: [ApplyRetention, RetentionSweeper, ...persistence],
})
export class PrivacyJobsModule {}
