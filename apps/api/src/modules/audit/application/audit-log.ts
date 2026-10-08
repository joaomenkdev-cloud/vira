import { Inject, Injectable } from "@nestjs/common";

import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from "../../../platform/runtime/runtime.js";
import { type AuditContext, type AuditEvent, buildAuditEntry } from "../domain/audit-entry.js";
import { AUDIT_LOG_REPOSITORY, type AuditLogRepository } from "./ports/audit-log-repository.js";

/** Records sensitive actions in the append-only audit log (docs/SECURITY_MODEL.md). */
@Injectable()
export class AuditLog {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly repository: AuditLogRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async record(event: AuditEvent, context: AuditContext): Promise<void> {
    const entry = buildAuditEntry(event, context, {
      id: this.ids.next(),
      occurredAt: this.clock.now(),
    });
    await this.repository.append(entry);
  }
}
