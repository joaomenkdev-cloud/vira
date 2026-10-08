import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";

import { AuditModule } from "../modules/audit/audit.module.js";
import { HealthModule } from "../modules/health/health.module.js";
import type { AppConfig } from "../platform/config/config.schema.js";
import { ConfigModule } from "../platform/config/config.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { ProblemDetailsFilter } from "../platform/errors/problem-details.filter.js";
import { createValidationPipe } from "../platform/errors/validation.js";
import { LoggingModule, type LoggingOptions } from "../platform/logging/logging.module.js";
import { RedisModule } from "../platform/redis/redis.module.js";
import { RuntimeModule } from "../platform/runtime/runtime.module.js";
import { AccessGuard } from "../platform/security/access.guard.js";

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
        RuntimeModule,
        AuditModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        { provide: APP_PIPE, useFactory: createValidationPipe },
      ],
    };
  }
}
