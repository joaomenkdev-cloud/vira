import { Module } from "@nestjs/common";

import { DispatchOutbox } from "./application/dispatch-outbox.js";
import { Outbox } from "./application/outbox.js";
import { MESSAGE_PUBLISHER } from "./application/ports/message-publisher.js";
import { OUTBOX_REPOSITORY } from "./application/ports/outbox-repository.js";
import { PurgeOutbox } from "./application/purge-outbox.js";
import { BullMqMessagePublisher } from "./infra/bullmq-message-publisher.js";
import { OutboxPoller } from "./infra/outbox-poller.js";
import { PrismaOutboxRepository } from "./infra/prisma-outbox-repository.js";

/** Recording side effects: what modules that change state import. */
@Module({
  providers: [Outbox, { provide: OUTBOX_REPOSITORY, useClass: PrismaOutboxRepository }],
  exports: [Outbox, OUTBOX_REPOSITORY],
})
export class OutboxModule {}

/** Moving recorded messages to the queues (manually, e.g. in tests). Needs Redis. */
@Module({
  imports: [OutboxModule],
  providers: [
    DispatchOutbox,
    PurgeOutbox,
    { provide: MESSAGE_PUBLISHER, useClass: BullMqMessagePublisher },
  ],
  exports: [DispatchOutbox, PurgeOutbox, MESSAGE_PUBLISHER],
})
export class OutboxDispatcherModule {}

/** Dispatching on a schedule: imported by the worker, and by the API in embedded mode. */
@Module({
  imports: [OutboxDispatcherModule],
  providers: [OutboxPoller],
})
export class OutboxPollerModule {}
