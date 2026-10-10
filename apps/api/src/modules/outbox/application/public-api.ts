// The only entry point other modules may use (docs/ARCHITECTURE.md#3-módulos-de-negócio).
export { Outbox } from "./outbox.js";
export type { OutboxType } from "../domain/outbox-catalog.js";
export type { OutboxEvent } from "../domain/outbox-message.js";
export { InvalidOutboxEventError } from "../domain/outbox-message.js";
