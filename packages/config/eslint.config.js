import { viraConfig } from "./eslint/index.js";

export default viraConfig({ kind: "package", tsconfigRootDir: import.meta.dirname });
