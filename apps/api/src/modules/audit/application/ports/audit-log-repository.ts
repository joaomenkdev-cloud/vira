import type { AuditEntry } from "../../domain/audit-entry.js";

/** Append-only storage of audit entries. There is deliberately no update or delete. */
export interface AuditLogRepository {
  append(entry: AuditEntry): Promise<void>;
}

export const AUDIT_LOG_REPOSITORY = Symbol("AUDIT_LOG_REPOSITORY");
