import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";

import { ConfigValidationError, loadConfig } from "../platform/config/load-config.js";
import { WorkerModule } from "./worker.module.js";

export interface RunWorkerOptions {
  /** Where startup errors are written. Defaults to stderr. */
  readonly writeError?: (message: string) => void;
}

/**
 * Validates the environment, then starts the background worker. Returns a non-zero
 * exit code, without starting anything, when the configuration is invalid.
 */
export async function runWorker(
  env: NodeJS.ProcessEnv,
  options: RunWorkerOptions = {},
): Promise<number> {
  const writeError = options.writeError ?? ((message) => process.stderr.write(`${message}\n`));

  let config;
  try {
    config = loadConfig(env);
  } catch (error) {
    if (!(error instanceof ConfigValidationError)) throw error;
    writeError(error.message);
    return 1;
  }

  const app = await NestFactory.createApplicationContext(WorkerModule.register({ config }), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();
  // SIGTERM/SIGINT close the application: the poller stops and connections are released.
  app.enableShutdownHooks();
  return 0;
}
