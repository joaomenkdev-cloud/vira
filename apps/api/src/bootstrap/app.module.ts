import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";

import { AuditModule } from "../modules/audit/audit.module.js";
import { AuthJobsModule, AuthModule } from "../modules/auth/auth.module.js";
import { HealthModule } from "../modules/health/health.module.js";
import { OutboxModule, OutboxPollerModule } from "../modules/outbox/outbox.module.js";
import { UsersModule } from "../modules/users/users.module.js";
import type { AppConfig } from "../platform/config/config.schema.js";
import { ConfigModule } from "../platform/config/config.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { ProblemDetailsFilter } from "../platform/errors/problem-details.filter.js";
import { createValidationPipe } from "../platform/errors/validation.js";
import { LoggingModule, type LoggingOptions } from "../platform/logging/logging.module.js";
import { MailModule } from "../platform/mail/mail.module.js";
import { QueueModule } from "../platform/queue/queue.module.js";
import { RateLimitModule } from "../platform/rate-limit/rate-limit.module.js";
import { RedisModule } from "../platform/redis/redis.module.js";
import { RuntimeModule } from "../platform/runtime/runtime.module.js";
import { AccessGuard } from "../platform/security/access.guard.js";
import { CsrfGuard } from "../platform/security/csrf.guard.js";
import { SecurityModule } from "../platform/security/security.module.js";

export interface AppModuleOptions {
  readonly config: AppConfig;
  readonly logging?: LoggingOptions;
}

@Module({})
export class AppModule {
  static register({ config, logging }: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config, logging),
        DatabaseModule,
        RedisModule,
        RateLimitModule,
        MailModule,
        RuntimeModule,
        SecurityModule,
        AuditModule,
        OutboxModule,
        AuthModule,
        UsersModule,
        HealthModule,
        // Embedded mode runs the background work inside the API process (ADR-0011).
        ...(config.worker.mode === "embedded"
          ? [QueueModule, OutboxPollerModule, AuthJobsModule]
          : []),
      ],
      providers: [
        // Guards run in this order: who may call the route, then whether the browser
        // request really comes from our own pages.
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        { provide: APP_PIPE, useFactory: createValidationPipe },
      ],
    };
  }
}
