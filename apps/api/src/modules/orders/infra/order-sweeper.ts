import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { SweepExpiredOrders } from "../application/sweep-expired-orders.js";

const SWEEP_EVERY_MS = 60_000;

/**
 * Runs the expiration sweep every minute, in the worker process (or inside the API when
 * `WORKER_MODE=embedded`). An in-process timer, like the outbox poller: the safety net for
 * lost jobs must not depend on Redis itself. Rounds never overlap.
 */
@Injectable()
export class OrderSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private stopped = false;

  constructor(
    private readonly sweep: SweepExpiredOrders,
    @InjectPinoLogger(OrderSweeper.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, SWEEP_EVERY_MS);
    // What ran out while no worker was up is freed right away.
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
      const expired = await this.sweep.execute();
      if (expired > 0) this.logger.info({ expired }, "Overdue orders expired");
    } catch (error) {
      this.logger.error({ err: error }, "Order expiration sweep failed");
    } finally {
      this.running = false;
    }
  }
}
