// Shared ESLint flat config for the Vira workspace.
//
// Boundary rules enforced here (by import specifier):
// - apps never import other apps; shared code lives in packages/* (ADR-0001);
// - packages never import apps;
// - domain code depends on no framework or infrastructure package, and
//   application/http code does not reach infrastructure SDKs directly (ADR-0002).
// Path-based layer and module rules (e.g. `application` importing `../infra`)
// are verified by dependency-cruiser, which resolves real file paths.

import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const TS_FILES = ["**/*.{ts,tsx,mts,cts}"];
const JS_FILES = ["**/*.{js,jsx,mjs,cjs}"];

/** Workspace packages that must never be imported from outside their own app. */
const APP_PACKAGES = ["@vira/api", "@vira/api/*", "@vira/web", "@vira/web/*"];

/** Infrastructure SDKs: only `infra` code may import them. */
export const INFRA_PACKAGES = [
  "@prisma/*",
  ".prisma/*",
  "stripe",
  "bullmq",
  "ioredis",
  "resend",
  "@aws-sdk/*",
];

/** Frameworks the domain layer must not know about. */
export const FRAMEWORK_PACKAGES = ["@nestjs/*", "next", "next/*", "react", "react-dom"];

/**
 * @typedef {{ group: string[], message: string }} RestrictedPattern
 * @typedef {"app" | "package"} WorkspaceKind
 */

/** @type {Record<WorkspaceKind, RestrictedPattern>} */
const workspacePatterns = {
  app: {
    group: [...APP_PACKAGES, "**/apps/**"],
    message: "Apps never import other apps; share code through packages/* (ADR-0001).",
  },
  package: {
    group: [...APP_PACKAGES, "**/apps/**"],
    message: "Packages must not depend on apps (ADR-0001).",
  },
};

/**
 * @param {RestrictedPattern[]} patterns
 * @returns {import("eslint").Linter.RulesRecord}
 */
const restrictImports = (patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

/**
 * Boundary rules for one workspace. Globs are relative to the workspace's own
 * eslint.config.js, so the workspace kind is passed in rather than inferred from
 * the path. ESLint replaces (not merges) a rule's options when several blocks
 * match a file, so each layer block repeats the workspace pattern.
 *
 * @param {WorkspaceKind} kind
 * @returns {import("eslint").Linter.Config[]}
 */
export function boundaries(kind) {
  const workspace = workspacePatterns[kind];
  return [
    {
      name: "vira/boundaries/workspace",
      rules: restrictImports([workspace]),
    },
    {
      name: "vira/boundaries/domain",
      files: ["**/modules/*/domain/**"],
      rules: restrictImports([
        workspace,
        {
          group: [...FRAMEWORK_PACKAGES, ...INFRA_PACKAGES],
          message: "The domain layer is pure: no framework or infrastructure imports (ADR-0002).",
        },
      ]),
    },
    {
      name: "vira/boundaries/application",
      files: ["**/modules/*/application/**"],
      rules: restrictImports([
        workspace,
        {
          group: INFRA_PACKAGES,
          message:
            "Use cases depend on ports; infrastructure SDKs belong in the infra layer (ADR-0002).",
        },
      ]),
    },
    {
      name: "vira/boundaries/http",
      files: ["**/modules/*/http/**"],
      rules: restrictImports([
        workspace,
        {
          group: INFRA_PACKAGES,
          message: "Controllers call use cases, never infrastructure directly (ADR-0002).",
        },
      ]),
    },
  ];
}

/**
 * @typedef {object} ViraConfigOptions
 * @property {WorkspaceKind} kind Whether the workspace is an app (apps/*) or a package (packages/*).
 * @property {string} [tsconfigRootDir] Directory of the tsconfig used for type-aware linting.
 * @property {boolean} [typeChecked] Enable type-aware rules (requires tsconfigRootDir). Default: true.
 * @property {string[]} [ignores] Extra global ignores.
 */

/**
 * Builds the flat config used by every workspace.
 *
 * @param {ViraConfigOptions} options
 * @returns {import("eslint").Linter.Config[]}
 */
export function viraConfig({ kind, tsconfigRootDir, typeChecked = true, ignores = [] }) {
  if (typeChecked && !tsconfigRootDir) {
    throw new Error("viraConfig: tsconfigRootDir is required when typeChecked is enabled.");
  }

  const tsPresets = typeChecked
    ? [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked]
    : [...tseslint.configs.strict, ...tseslint.configs.stylistic];

  return defineConfig(
    globalIgnores(["**/dist/**", "**/.next/**", "**/coverage/**", "**/.turbo/**", ...ignores]),
    {
      name: "vira/javascript",
      extends: [js.configs.recommended],
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        globals: { ...globals.node },
      },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: {
        eqeqeq: ["error", "always"],
        "no-console": "error",
        "no-implicit-coercion": "error",
        "no-param-reassign": "error",
        "prefer-const": "error",
        "object-shorthand": "error",
      },
    },
    {
      name: "vira/typescript",
      files: TS_FILES,
      extends: tsPresets,
      languageOptions: typeChecked
        ? { parserOptions: { projectService: true, tsconfigRootDir } }
        : {},
      rules: {
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        ...(typeChecked
          ? {
              "@typescript-eslint/switch-exhaustiveness-check": "error",
              "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
            }
          : {}),
      },
    },
    {
      name: "vira/tests",
      files: ["**/*.test.{ts,tsx,js}", "**/test/**"],
      rules: { "no-console": "off" },
    },
    ...boundaries(kind),
    { name: "vira/prettier", ...prettier },
  );
}

export { JS_FILES, TS_FILES };
