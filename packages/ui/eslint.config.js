import { viraConfig } from "@vira/config/eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  ...viraConfig({ kind: "package", tsconfigRootDir: import.meta.dirname }),
  reactHooks.configs.flat.recommended,
];
