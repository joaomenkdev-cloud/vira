import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger } from "nestjs-pino";

import type { AppConfig } from "../platform/config/config.schema.js";
import { applyHttpHardening } from "../platform/http/http-hardening.js";
import { setupOpenApi } from "../platform/openapi/setup-openapi.js";

export const API_PREFIX = "api/v1";

/** Application-wide HTTP setup, shared by `main.ts` and the integration tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.flushLogs();
  applyHttpHardening(app, config);
  app.setGlobalPrefix(API_PREFIX);
  setupOpenApi(app, config);
  app.enableShutdownHooks();
}
