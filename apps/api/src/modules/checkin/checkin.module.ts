import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { TicketsModule } from "../tickets/tickets.module.js";
import { UsersModule } from "../users/users.module.js";
import { CheckIn } from "./application/check-in.js";
import { GetCheckinStats } from "./application/get-checkin-stats.js";
import { CHECKIN_REPOSITORY } from "./application/ports/checkin-repository.js";
import { CheckinController } from "./http/checkin.controller.js";
import { PrismaCheckinRepository } from "./infra/prisma-checkin-repository.js";

/**
 * The check-in (V8, ADR-0008): the organizer lets each ticket in once, by its QR or its
 * code, and every read at the door is recorded.
 */
@Module({
  imports: [AuditModule, TicketsModule, UsersModule],
  controllers: [CheckinController],
  providers: [
    CheckIn,
    GetCheckinStats,
    { provide: CHECKIN_REPOSITORY, useClass: PrismaCheckinRepository },
  ],
})
export class CheckinModule {}
