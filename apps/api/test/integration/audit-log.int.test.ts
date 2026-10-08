import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditLog } from "../../src/modules/audit/application/public-api.js";
import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

const actor = { id: "0192a0e4-0000-7000-8000-0000000000aa", role: "ADMIN" } as const;
const targetUser = "0192a0e4-0000-7000-8000-0000000000bb";

describe.skipIf(!dockerAvailable)("audit log (PostgreSQL)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;
  let prisma: PrismaService;

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: { DATABASE_URL: infrastructure.databaseUrl, REDIS_URL: infrastructure.redisUrl },
    });
    prisma = testApp.app.get(PrismaService);
    await testApp.app.get(AuditLog).record(
      {
        action: "admin.role_changed",
        entityId: targetUser,
        metadata: { from: "BUYER", to: "ORGANIZER" },
      },
      { actor, requestId: "req-audit-0001" },
    );
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("stores recorded events", async () => {
    const rows = await prisma.auditLog.findMany({ where: { entityId: targetUser } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: actor.id,
      actorRole: "ADMIN",
      action: "admin.role_changed",
      entityType: "user",
      requestId: "req-audit-0001",
      metadata: { from: "BUYER", to: "ORGANIZER" },
    });
  });

  it.each([
    ["UPDATE", `UPDATE audit_logs SET action = 'user.anonymized'`],
    ["DELETE", `DELETE FROM audit_logs`],
    ["TRUNCATE", `TRUNCATE audit_logs`],
  ])("rejects %s", async (operation, sql) => {
    await expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow(
      `audit_logs is append-only: ${operation} is not allowed`,
    );
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("enforces the action format and the actor/role pairing in the database", async () => {
    const base = {
      occurredAt: new Date(),
      entityType: "user",
      metadata: {},
    };
    await expect(
      prisma.auditLog.create({
        data: {
          ...base,
          id: "0192a0e4-0000-7000-8000-000000000101",
          actorRole: "SYSTEM",
          action: "Not A Format",
        },
      }),
    ).rejects.toThrow(/audit_logs_action_format/);
    await expect(
      prisma.auditLog.create({
        data: {
          ...base,
          id: "0192a0e4-0000-7000-8000-000000000102",
          actorRole: "SYSTEM",
          actorId: actor.id,
          action: "user.anonymized",
        },
      }),
    ).rejects.toThrow(/audit_logs_actor_matches_role/);
  });
});
