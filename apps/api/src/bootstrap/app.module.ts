import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";

import { AuditModule } from "../modules/audit/audit.module.js";
import { AuthJobsModule, AuthModule } from "../modules/auth/auth.module.js";
import { CatalogModule } from "../modules/catalog/catalog.module.js";
import { EventsJobsModule, EventsModule } from "../modules/events/events.module.js";
import { HealthModule } from "../modules/health/health.module.js";
import { OrdersJobsModule, OrdersModule } from "../modules/orders/orders.module.js";
import { OutboxModule, OutboxPollerModule } from "../modules/outbox/outbox.module.js";
import { PaymentsJobsModule } from "../modules/payments/payments.module.js";
import { UsersModule } from "../modules/users/users.module.js";
import type { AppConfig } from "../platform/config/config.schema.js";
import { ConfigModule } from "../platform/config/config.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { ProblemDetailsFilter } from "../platform/errors/problem-details.filter.js";
import { createValidationPipe } from "../platform/errors/validation.js";
import { LoggingModule, type LoggingOptions } from "../platform/logging/logging.module.js";
import { MailModule } from "../platform/mail/mail.module.js";
import { PaginationModule } from "../platform/pagination/pagination.module.js";
import { QueueClientModule, QueueModule } from "../platform/queue/queue.module.js";
import { RateLimitModule } from "../platform/rate-limit/rate-limit.module.js";
import { RedisModule } from "../platform/redis/redis.module.js";
import { RuntimeModule } from "../platform/runtime/runtime.module.js";
import { AccessGuard } from "../platform/security/access.guard.js";
import { CsrfGuard } from "../platform/security/csrf.guard.js";
import { SecurityModule } from "../platform/security/security.module.js";
import { StorageModule } from "../platform/storage/storage.module.js";

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
        PaginationModule,
        StorageModule,
        // Orders schedule their expiration from the API, whatever the worker mode.
        QueueClientModule,
        SecurityModule,
        AuditModule,
        OutboxModule,
        AuthModule,
        UsersModule,
        EventsModule,
        CatalogModule,
        OrdersModule,
        HealthModule,
        // Embedded mode runs the background work inside the API process (ADR-0011).
        ...(config.worker.mode === "embedded"
          ? [
              QueueModule,
              OutboxPollerModule,
              AuthJobsModule,
              EventsJobsModule,
              OrdersJobsModule,
              PaymentsJobsModule,
            ]
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
