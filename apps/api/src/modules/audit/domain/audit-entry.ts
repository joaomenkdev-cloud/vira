import type { Role } from "@vira/shared";

import {
  AUDIT_CATALOG,
  type AuditAction,
  type AuditEntityType,
  type AuditMetadata,
} from "./audit-catalog.js";

/** One auditable occurrence, typed by action so metadata always matches the catalog. */
export type AuditEvent = {
  [A in AuditAction]: {
    readonly action: A;
    /** Id of the entity the action is about; omitted when it does not exist (e.g. unknown login). */
    readonly entityId?: string;
    readonly metadata: AuditMetadata<A>;
  };
}[AuditAction];

/** Who performed the action: a user, or the system (webhooks, jobs). */
export type AuditActor = { readonly id: string; readonly role: Role } | "system";

export interface AuditContext {
  readonly actor: AuditActor;
  /** Correlates the entry with the request logs. */
  readonly requestId?: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorId: string | null;
  readonly actorRole: Role | "SYSTEM";
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string | null;
  readonly requestId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export class InvalidAuditEventError extends Error {
  constructor(
    readonly action: string,
    readonly problems: readonly string[],
  ) {
    super(`Invalid audit event "${action}": ${problems.join("; ")}`);
    this.name = "InvalidAuditEventError";
  }
}

/**
 * Builds a validated, immutable entry. Rejects metadata that does not match the
 * catalog, which keeps unexpected (and possibly personal) data out of the log.
 */
export function buildAuditEntry(
  event: AuditEvent,
  context: AuditContext,
  stamp: { readonly id: string; readonly occurredAt: Date },
): AuditEntry {
  const definition = AUDIT_CATALOG[event.action];
  const parsed = definition.metadata.safeParse(event.metadata, { reportInput: false });
  if (!parsed.success) {
    throw new InvalidAuditEventError(
      event.action,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "metadata"}: ${issue.message}`),
    );
  }

  return Object.freeze({
    id: stamp.id,
    occurredAt: stamp.occurredAt,
    actorId: context.actor === "system" ? null : context.actor.id,
    actorRole: context.actor === "system" ? "SYSTEM" : context.actor.role,
    action: event.action,
    entityType: definition.entityType,
    entityId: event.entityId ?? null,
    requestId: context.requestId ?? null,
    metadata: Object.freeze({ ...parsed.data }),
  });
}
