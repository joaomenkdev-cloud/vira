import { viraVitestConfig } from "@vira/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  viraVitestConfig,
  defineConfig({
    // The components render in jsdom; the contrast of the tokens is plain file reading.
    oxc: { jsx: { runtime: "automatic" } },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
      setupFiles: ["./test/setup.ts"],
    },
  }),
);
