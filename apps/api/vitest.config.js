import { viraVitestConfig } from "@vira/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// NestJS dependency injection relies on legacy decorators with emitted metadata.
export default mergeConfig(
  viraVitestConfig,
  defineConfig({
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
  }),
);
