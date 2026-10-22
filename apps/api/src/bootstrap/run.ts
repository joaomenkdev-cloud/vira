import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { ConfigValidationError, loadConfig } from "../platform/config/load-config.js";
import { initErrorReporting } from "../platform/observability/error-reporting.js";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";

export interface RunOptions {
  /** Where startup errors are written. Defaults to stderr. */
  readonly writeError?: (message: string) => void;
}

/**
 * Validates the environment, then starts the HTTP server. Returns a non-zero exit
 * code, without starting anything, when the configuration is invalid.
 */
export async function run(env: NodeJS.ProcessEnv, options: RunOptions = {}): Promise<number> {
  const writeError = options.writeError ?? ((message) => process.stderr.write(`${message}\n`));

  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigValidationError)) throw error;
    writeError(error.message);
    return 1;
  }
  initErrorReporting(config, "api");

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register({ config }), {
    bufferLogs: true,
    bodyParser: false,
    // The JSON parser keeps the exact bytes too: Stripe signs what it sends (V4 webhook).
    rawBody: true,
  });
  configureApp(app, config);
  await app.listen(config.http.port, config.http.host);
  return 0;
}
