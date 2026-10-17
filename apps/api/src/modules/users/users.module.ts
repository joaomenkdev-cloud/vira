import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { BecomeOrganizer } from "./application/become-organizer.js";
import { GetAccount } from "./application/get-account.js";
import { OrganizerProfiles } from "./application/organizer-profiles.js";
import { ACCOUNT_REPOSITORY } from "./application/ports/account-repository.js";
import { UpdateProfile } from "./application/update-profile.js";
import { MeController } from "./http/me.controller.js";
import { PrismaAccountRepository } from "./infra/prisma-account-repository.js";

/** The caller's own account: profile and organizer profile (N6). */
@Module({
  imports: [AuditModule],
  controllers: [MeController],
  providers: [
    GetAccount,
    UpdateProfile,
    BecomeOrganizer,
    OrganizerProfiles,
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
  ],
  exports: [OrganizerProfiles],
})
export class UsersModule {}
