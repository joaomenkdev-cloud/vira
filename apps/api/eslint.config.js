import { viraConfig } from "@vira/config/eslint";

export default viraConfig({
  kind: "app",
  tsconfigRootDir: import.meta.dirname,
  // Fixtures intentionally violate the layer rules to test dependency-cruiser.
  ignores: ["test/fixtures/**", "src/generated/**"],
});
