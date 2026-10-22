import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { ApplyRetention } from "../application/apply-retention.js";

/**
 * The rules are daily (docs/PRIVACY.md#5-retenção-automática); checking every few hours
 * keeps a worker that restarts often from skipping days. Rounds are idempotent.
 */
const ROUND_EVERY_MS = 6 * 60 * 60_000;

/**
 * Applies the retention rules on a fixed interval, in the worker process (or inside the
 * API when `WORKER_MODE=embedded`). Several instances may run at once: every rule is an
 * update or delete that a second run finds already done. Rounds never overlap.
 */
@Injectable()
export class RetentionSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly retention: ApplyRetention,
    @InjectPinoLogger(RetentionSweeper.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, ROUND_EVERY_MS);
    // What came due while no worker was up goes right away.
    void this.tick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One round; rounds never overlap. */
  async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const summary = await this.retention.execute();
      if (Object.values(summary).some((count) => count > 0)) {
        this.logger.info(summary, "Retention rules applied");
      }
    } catch (error) {
      this.logger.error({ err: error }, "Retention round failed");
    } finally {
      this.running = false;
    }
  }
}
