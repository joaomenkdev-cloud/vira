import type { DynamicModule, Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";

import { AppModule } from "../../src/bootstrap/app.module.js";
import { configureApp } from "../../src/bootstrap/configure-app.js";
import type { AppConfig } from "../../src/platform/config/config.schema.js";
import { loadConfig } from "../../src/platform/config/load-config.js";

export const TEST_WEB_ORIGIN = "http://localhost:3001";

/**
 * Endpoints nothing listens on: suites that do not need infrastructure still boot
 * (connections are lazy) and see the dependencies as down. Integration suites pass
 * the URLs of real containers instead (test/support/infrastructure.ts).
 */
export const UNREACHABLE_INFRASTRUCTURE = {
  DATABASE_URL: "postgresql://vira:unused@127.0.0.1:1/vira",
  REDIS_URL: "redis://127.0.0.1:1",
};

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly config: AppConfig;
  /** Every log line written by the app, as raw JSON strings. */
  readonly logs: string[];
}

export interface TestAppOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly imports?: (Type | DynamicModule)[];
  /** Replaces providers (e.g. the clock or a publisher) before the app is built. */
  readonly override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export async function createTestApp({
  env = {},
  imports = [],
  override = (builder) => builder,
}: TestAppOptions = {}): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: "test",
    WEB_ORIGIN: TEST_WEB_ORIGIN,
    LOG_LEVEL: "info",
    ...UNREACHABLE_INFRASTRUCTURE,
    ...env,
  });
  const logs: string[] = [];
  const destination = { write: (line: string) => void logs.push(line) };

  const builder = Test.createTestingModule({
    imports: [AppModule.register({ config, logging: { destination } }), ...imports],
  });
  const moduleRef = await override(builder).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
    bodyParser: false,
  });
  configureApp(app, config);
  await app.init();
  return { app, config, logs };
}
