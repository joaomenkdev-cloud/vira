import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { EndSession } from "./application/end-session.js";
import { ListSessions } from "./application/list-sessions.js";
import { LoginUser } from "./application/login-user.js";
import { PASSWORD_HASHER } from "./application/ports/password-hasher.js";
import { SESSION_REPOSITORY } from "./application/ports/session-repository.js";
import { USER_REPOSITORY } from "./application/ports/user-repository.js";
import { VERIFICATION_TOKEN_REPOSITORY } from "./application/ports/verification-token-repository.js";
import { RefreshSession } from "./application/refresh-session.js";
import { RegisterUser } from "./application/register-user.js";
import { SendAccountExistsNotice } from "./application/send-account-exists-notice.js";
import { SendVerificationEmail } from "./application/send-verification-email.js";
import { StartSession } from "./application/start-session.js";
import { VerifyEmail } from "./application/verify-email.js";
import { AuthController } from "./http/auth.controller.js";
import { Argon2PasswordHasher } from "./infra/argon2-password-hasher.js";
import { AuthJobHandlers } from "./infra/auth-job-handlers.js";
import { PrismaSessionRepository } from "./infra/prisma-session-repository.js";
import { PrismaUserRepository } from "./infra/prisma-user-repository.js";
import { PrismaVerificationTokenRepository } from "./infra/prisma-verification-token-repository.js";

/** What every process that touches accounts needs: the repositories. */
@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: VERIFICATION_TOKEN_REPOSITORY, useClass: PrismaVerificationTokenRepository },
  ],
  exports: [USER_REPOSITORY, VERIFICATION_TOKEN_REPOSITORY],
})
export class AuthDataModule {}

/** The HTTP side: sign-up, e-mail verification, login and sessions. */
@Module({
  imports: [AuthDataModule, AuditModule, OutboxModule],
  controllers: [AuthController],
  providers: [
    RegisterUser,
    VerifyEmail,
    LoginUser,
    StartSession,
    RefreshSession,
    EndSession,
    ListSessions,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
  ],
})
export class AuthModule {}

/** The background side: sends the e-mails the HTTP side asked for (worker, or the API in embedded mode). */
@Module({
  imports: [AuthDataModule],
  providers: [SendVerificationEmail, SendAccountExistsNotice, AuthJobHandlers],
})
export class AuthJobsModule {}
