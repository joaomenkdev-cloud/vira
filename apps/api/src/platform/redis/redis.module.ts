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
  private connecting: Promise<void> | undefined;

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

  /**
   * Resolves once commands can be sent. The connection is lazy and commands are not
   * queued while it is being made, so a request that arrives right after startup (or
   * after a drop) would otherwise fail; concurrent callers share one connection attempt.
   */
  async ensureReady(timeoutMs = 2_000): Promise<void> {
    if (this.isReady()) return;
    if (this.status === "wait" || this.status === "end") {
      this.connecting ??= this.connect().finally(() => {
        this.connecting = undefined;
      });
    }
    if (this.connecting) await this.connecting;
    if (this.isReady()) return;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("ready", onReady);
        reject(new Error("Redis is not ready"));
      }, timeoutMs);
      const onReady = () => {
        clearTimeout(timer);
        resolve();
      };
      this.once("ready", onReady);
    });
  }

  private isReady(): boolean {
    return this.status === "ready";
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
