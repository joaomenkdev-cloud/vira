import { viraVitestConfig } from "@vira/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  viraVitestConfig,
  defineConfig({
    // NestJS dependency injection relies on legacy decorators with emitted metadata.
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    test: {
      // Integration suites pull and start containers before their first test.
      hookTimeout: 180_000,
    },
  }),
);
