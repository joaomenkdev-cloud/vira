import { Global, Module } from "@nestjs/common";

import { JobHandlerRegistry } from "./job-handlers.js";
import { QueueConsumers } from "./queue-consumers.js";
import { QueueService } from "./queue.service.js";

export { QUEUE_OPERATION_TIMEOUT_MS, QueueService } from "./queue.service.js";

/** Enqueuing only: what the API needs to schedule jobs, whatever the worker mode. */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueClientModule {}

/** Consuming the queues: the worker process, or the API in embedded mode. */
@Global()
@Module({
  imports: [QueueClientModule],
  providers: [JobHandlerRegistry, QueueConsumers],
  exports: [JobHandlerRegistry],
})
export class QueueModule {}
