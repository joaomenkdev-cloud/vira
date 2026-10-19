import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import {
  GenericContainer,
  getContainerRuntimeClient,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

// Same images as docker-compose.yml, so tests run against what developers use.
export const POSTGRES_IMAGE = "postgres:16.15-alpine";
export const REDIS_IMAGE = "redis:8.8-alpine";
export const MAILPIT_IMAGE = "axllent/mailpit:v1.31";
export const SEAWEEDFS_IMAGE = "chrislusf/seaweedfs:4.48";

const API_ROOT = join(import.meta.dirname, "..", "..");
const SEAWEEDFS_CONFIG = join(API_ROOT, "..", "..", "infra", "seaweedfs", "s3.json");
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
  /** Present when started with `{ mail: true }`. */
  readonly mailpit: Mailpit | undefined;
  /** Present when started with `{ storage: true }`. */
  readonly storage: Storage | undefined;
  stop(): Promise<void>;
}

/** A Mailpit container: an SMTP server that keeps what it receives and shows it over HTTP. */
export interface Mailpit {
  readonly smtpUrl: string;
  /** Base URL of Mailpit's HTTP API. */
  readonly apiUrl: string;
  readonly container: StartedTestContainer;
}

/** SeaweedFS's S3 gateway, as in docker-compose.yml (ADR-0012), with an empty bucket. */
export interface Storage {
  /** The `S3_*` variables that point the API at it. */
  readonly env: {
    readonly S3_ENDPOINT: string;
    readonly S3_BUCKET: string;
    readonly S3_ACCESS_KEY_ID: string;
    readonly S3_SECRET_ACCESS_KEY: string;
  };
  readonly container: StartedTestContainer;
}

async function startStorage(): Promise<Storage> {
  const container = await new GenericContainer(SEAWEEDFS_IMAGE)
    .withCommand([
      "server",
      "-dir=/data",
      "-s3",
      "-s3.port=8333",
      "-s3.config=/etc/seaweedfs/s3.json",
    ])
    .withCopyFilesToContainer([{ source: SEAWEEDFS_CONFIG, target: "/etc/seaweedfs/s3.json" }])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forHttp("/healthz", 8333).withStartupTimeout(120_000))
    .start();
  return {
    // Local-only credentials of infra/seaweedfs/s3.json.
    env: {
      S3_ENDPOINT: `http://${container.getHost()}:${container.getMappedPort(8333)}`,
      S3_BUCKET: "vira-test",
      S3_ACCESS_KEY_ID: "vira-local",
      S3_SECRET_ACCESS_KEY: "vira-local-secret",
    },
    container,
  };
}

async function startMailpit(): Promise<Mailpit> {
  const container = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp("/readyz", 8025))
    .start();
  return {
    smtpUrl: `smtp://${container.getHost()}:${container.getMappedPort(1025)}`,
    apiUrl: `http://${container.getHost()}:${container.getMappedPort(8025)}`,
    container,
  };
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

/**
 * Starts PostgreSQL and Redis containers (and Mailpit, with `{ mail: true }`, and
 * SeaweedFS, with `{ storage: true }`) and applies every migration. The bucket is not
 * created: suites set it up the way `pnpm storage:setup` does.
 */
export async function startInfrastructure(
  options: { readonly mail?: boolean; readonly storage?: boolean } = {},
): Promise<Infrastructure> {
  const [postgres, redis, mailpit, storage] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase("vira")
      .withUsername("vira")
      .withPassword("vira_test")
      .start(),
    new RedisContainer(REDIS_IMAGE).start(),
    options.mail ? startMailpit() : Promise.resolve(undefined),
    options.storage ? startStorage() : Promise.resolve(undefined),
  ]);
  const databaseUrl = postgres.getConnectionUri();
  await migrate(databaseUrl);

  return {
    databaseUrl,
    redisUrl: redis.getConnectionUrl(),
    postgres,
    redis,
    mailpit,
    storage,
    stop: async () => {
      await Promise.all([
        postgres.stop(),
        redis.stop(),
        mailpit?.container.stop(),
        storage?.container.stop(),
      ]);
    },
  };
}
