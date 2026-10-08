// Shared Vitest preset. Workspaces extend it with `mergeConfig` from "vitest/config".

import { defineConfig } from "vitest/config";

export const viraVitestConfig = defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.{ts,js}"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    // Integration suites start containers or heavyweight tooling; keep the default generous.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov"],
      include: ["src/**"],
      exclude: ["**/*.test.ts", "**/test/**"],
    },
  },
});
