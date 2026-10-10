import { viraConfig } from "@vira/config/eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...viraConfig({
    kind: "app",
    tsconfigRootDir: import.meta.dirname,
    ignores: ["next-env.d.ts", "playwright-report/**", "test-results/**"],
  }),
  reactHooks.configs.flat.recommended,
];
