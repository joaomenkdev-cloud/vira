import { Global, Inject, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import type { AppConfig } from "../config/config.schema.js";
import { APP_CONFIG } from "../config/config.module.js";

/**
 * Shared Redis connection for rate limiting and cache-like data. Queues (BullMQ)
 * open their own connections. Nothing durable depends on Redis alone: the
 * database is the source of truth (docs/ARCHITECTURE.md).
 */
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super(config.redis.url, {
      lazyConnect: true,
      connectTimeout: 5_000,
      // Fail fast instead of queueing commands while Redis is down.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectionName: "vira-api",
    });
    // Without a listener ioredis prints every connection error. Failures are
    // reported by the readiness check, so they are not repeated here.
    this.on("error", () => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.status === "ready") await this.quit();
    else this.disconnect();
  }
}

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
