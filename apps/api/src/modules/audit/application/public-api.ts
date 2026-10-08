// The only entry point other modules may use (docs/ARCHITECTURE.md#3-módulos-de-negócio).
export { AuditLog } from "./audit-log.js";
export type { AuditAction } from "../domain/audit-catalog.js";
export type { AuditActor, AuditContext, AuditEvent } from "../domain/audit-entry.js";
export { InvalidAuditEventError } from "../domain/audit-entry.js";
