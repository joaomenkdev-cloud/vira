import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { DispatchOutbox } from "../application/dispatch-outbox.js";
import { PurgeOutbox } from "../application/purge-outbox.js";

const PURGE_EVERY_MS = 60 * 60_000;

/**
 * Checks the outbox on a fixed interval and dispatches what is due. It runs in the
 * worker process, or inside the API when `WORKER_MODE=embedded`. Several instances
 * can run at once: the repository locks the rows it hands out.
 */
@Injectable()
export class OutboxPoller implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private lastPurgeAt = 0;
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly dispatchOutbox: DispatchOutbox,
    private readonly purgeOutbox: PurgeOutbox,
    @InjectPinoLogger(OutboxPoller.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.worker.outboxPollIntervalMs);
    void this.tick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One polling round. Rounds never overlap: a slow one makes the next skip. */
  async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const summary = await this.dispatchOutbox.execute();
      if (summary.dispatched > 0 || summary.failed > 0) {
        this.logger.info(summary, "Outbox dispatched");
      }
      if (Date.now() - this.lastPurgeAt >= PURGE_EVERY_MS) {
        this.lastPurgeAt = Date.now();
        const purged = await this.purgeOutbox.execute();
        if (purged > 0) this.logger.info({ purged }, "Outbox purged");
      }
    } catch (error) {
      this.logger.error({ err: error }, "Outbox polling failed");
    } finally {
      this.running = false;
    }
  }
}
