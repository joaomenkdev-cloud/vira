import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { SweepMediaUploads } from "../application/sweep-media-uploads.js";

const SWEEP_EVERY_MS = 10 * 60_000;

/**
 * Runs the upload sweep on a fixed interval, in the worker process (or inside the API when
 * `WORKER_MODE=embedded`). Several instances may run at once: deleting is idempotent.
 */
@Injectable()
export class MediaSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly sweep: SweepMediaUploads,
    @InjectPinoLogger(MediaSweeper.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, SWEEP_EVERY_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** One round; rounds never overlap. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const removed = await this.sweep.execute();
      if (removed > 0) this.logger.info({ removed }, "Media uploads swept");
    } catch (error) {
      this.logger.error({ err: error }, "Media upload sweep failed");
    } finally {
      this.running = false;
    }
  }
}
