import { describe, expect, it } from "vitest";

import type { AuditEntry } from "../domain/audit-entry.js";
import { InvalidAuditEventError } from "../domain/audit-entry.js";
import { AuditLog } from "./audit-log.js";
import type { AuditLogRepository } from "./ports/audit-log-repository.js";

class InMemoryAuditLogRepository implements AuditLogRepository {
  readonly entries: AuditEntry[] = [];
  append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

const now = new Date("2026-10-08T12:00:00Z");
const ids = ["0192a0e4-0000-7000-8000-000000000001", "0192a0e4-0000-7000-8000-000000000002"];
const userId = "0192a0e4-0000-7000-8000-0000000000aa";

function setup() {
  const repository = new InMemoryAuditLogRepository();
  let next = 0;
  const auditLog = new AuditLog(repository, { now: () => now }, { next: () => ids[next++] ?? "" });
  return { repository, auditLog };
}

describe("AuditLog", () => {
  it("stamps each entry with a new id and the current time", async () => {
    const { repository, auditLog } = setup();
    await auditLog.record(
      { action: "user.data_exported", entityId: userId, metadata: {} },
      {
        actor: { id: userId, role: "BUYER" },
      },
    );
    await auditLog.record(
      { action: "auth.logout_all", metadata: { revokedSessions: 2 } },
      {
        actor: { id: userId, role: "BUYER" },
        requestId: "req-12345678",
      },
    );

    expect(repository.entries.map((e) => [e.id, e.occurredAt, e.action])).toEqual([
      [ids[0], now, "user.data_exported"],
      [ids[1], now, "auth.logout_all"],
    ]);
  });

  it("stores nothing when the event is invalid", async () => {
    const { repository, auditLog } = setup();
    await expect(
      auditLog.record(
        { action: "auth.logout_all", metadata: { revokedSessions: -1 } },
        { actor: "system" },
      ),
    ).rejects.toBeInstanceOf(InvalidAuditEventError);
    expect(repository.entries).toEqual([]);
  });
});
