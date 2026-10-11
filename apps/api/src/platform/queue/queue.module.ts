import { Global, Module } from "@nestjs/common";

import { JobHandlerRegistry } from "./job-handlers.js";
import { QueueConsumers } from "./queue-consumers.js";
import { QueueService } from "./queue.service.js";

export { QUEUE_OPERATION_TIMEOUT_MS, QueueService } from "./queue.service.js";

@Global()
@Module({
  providers: [QueueService, JobHandlerRegistry, QueueConsumers],
  exports: [QueueService, JobHandlerRegistry],
})
export class QueueModule {}
