import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { getContainerRuntimeClient } from "testcontainers";

// Same images as docker-compose.yml, so tests run against what developers use.
export const POSTGRES_IMAGE = "postgres:16.15-alpine";
export const REDIS_IMAGE = "redis:8.8-alpine";

const API_ROOT = join(import.meta.dirname, "..", "..");
const PRISMA_CLI = join(
  dirname(createRequire(import.meta.url).resolve("prisma/package.json")),
  "build",
  "index.js",
);

export interface Infrastructure {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly postgres: StartedPostgreSqlContainer;
  readonly redis: StartedRedisContainer;
  stop(): Promise<void>;
}

async function isDockerAvailable(): Promise<boolean> {
  try {
    await getContainerRuntimeClient();
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether container-backed suites can run. In CI a missing Docker daemon is an
 * error; locally the suites are skipped with a warning.
 */
export async function dockerAvailableOrSkip(): Promise<boolean> {
  if (await isDockerAvailable()) return true;
  if (process.env["CI"]) throw new Error("Docker is required for integration tests in CI.");
  process.stderr.write("WARNING: Docker unavailable; skipping integration tests.\n");
  return false;
}

export async function migrate(databaseUrl: string): Promise<void> {
  await promisify(execFile)(process.execPath, [PRISMA_CLI, "migrate", "deploy"], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

/** Starts PostgreSQL and Redis containers and applies every migration. */
export async function startInfrastructure(): Promise<Infrastructure> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase("vira")
      .withUsername("vira")
      .withPassword("vira_test")
      .start(),
    new RedisContainer(REDIS_IMAGE).start(),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  await migrate(databaseUrl);

  return {
    databaseUrl,
    redisUrl: redis.getConnectionUrl(),
    postgres,
    redis,
    stop: async () => {
      await Promise.all([postgres.stop(), redis.stop()]);
    },
  };
}
