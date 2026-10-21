import { type DynamicModule, Module } from "@nestjs/common";

import { AuthJobsModule } from "../modules/auth/auth.module.js";
import { EventsJobsModule } from "../modules/events/events.module.js";
import { OrdersJobsModule } from "../modules/orders/orders.module.js";
import { OutboxPollerModule } from "../modules/outbox/outbox.module.js";
import { ConfigModule } from "../platform/config/config.module.js";
import type { AppConfig } from "../platform/config/config.schema.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { LoggingModule, type LoggingOptions } from "../platform/logging/logging.module.js";
import { MailModule } from "../platform/mail/mail.module.js";
import { QueueModule } from "../platform/queue/queue.module.js";
import { RuntimeModule } from "../platform/runtime/runtime.module.js";
import { StorageModule } from "../platform/storage/storage.module.js";

export interface WorkerModuleOptions {
  readonly config: AppConfig;
  readonly logging?: LoggingOptions;
}

/**
 * The background worker: no HTTP, only what runs on a schedule or consumes queues.
 * It shares the modules, layers and configuration of the API (ADR-0002).
 */
@Module({})
export class WorkerModule {
  static register({ config, logging }: WorkerModuleOptions): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggingModule.forRoot(config, logging),
        DatabaseModule,
        RuntimeModule,
        MailModule,
        StorageModule,
        QueueModule,
        OutboxPollerModule,
        AuthJobsModule,
        EventsJobsModule,
        OrdersJobsModule,
      ],
    };
  }
}
