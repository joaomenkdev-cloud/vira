import { type DynamicModule, Global, Module } from "@nestjs/common";

import type { AppConfig } from "./config.schema.js";

export const APP_CONFIG = Symbol("APP_CONFIG");

/**
 * Exposes the already-validated configuration. The environment is parsed once in
 * `main.ts`, before Nest starts, so nothing inside the container reads `process.env`.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
