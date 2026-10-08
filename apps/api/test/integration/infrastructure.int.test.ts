import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/platform/database/prisma.service.js";
import { createTestApp, type TestApp } from "../support/create-test-app.js";
import {
  dockerAvailableOrSkip,
  type Infrastructure,
  startInfrastructure,
} from "../support/infrastructure.js";

const dockerAvailable = await dockerAvailableOrSkip();

describe.skipIf(!dockerAvailable)("database and Redis (Testcontainers)", () => {
  let infrastructure: Infrastructure;
  let testApp: TestApp;

  beforeAll(async () => {
    infrastructure = await startInfrastructure();
    testApp = await createTestApp({
      env: { DATABASE_URL: infrastructure.databaseUrl, REDIS_URL: infrastructure.redisUrl },
    });
  });

  afterAll(async () => {
    await testApp.app.close();
    await infrastructure.stop();
  });

  it("applies every migration", async () => {
    const prisma = testApp.app.get(PrismaService);
    const extensions = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pg_trgm') ORDER BY extname`;
    expect(extensions.map((e) => e.extname)).toEqual(["citext", "pg_trgm"]);

    const pending = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL`;
    expect(pending[0]?.count).toBe(0n);
  });

  it("bounds every statement with a timeout", async () => {
    const prisma = testApp.app.get(PrismaService);
    const [setting] = await prisma.$queryRaw<
      { statement_timeout: string }[]
    >`SHOW statement_timeout`;
    expect(setting?.statement_timeout).toBe("5s");
  });

  it("is ready when both dependencies answer", async () => {
    const response = await request(testApp.app.getHttpServer())
      .get("/api/v1/health/ready")
      .expect(200);
    expect(response.body).toEqual({ status: "ok", checks: { database: "up", redis: "up" } });
  });

  it("reports the dependency that goes down", async () => {
    await infrastructure.redis.stop();
    const response = await request(testApp.app.getHttpServer())
      .get("/api/v1/health/ready")
      .expect(503);
    expect(response.body).toEqual({
      status: "unavailable",
      checks: { database: "up", redis: "down" },
    });
  });
});
