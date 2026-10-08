// Path-based architecture rules (ADR-0002, docs/ARCHITECTURE.md#4-camadas).
// ESLint's import rules cover package names; these cover real file paths.

/** @type {import("dependency-cruiser").IForbiddenRuleType[]} */
export const forbidden = [
  {
    name: "no-circular",
    comment: "Circular dependencies make initialization order and layering unpredictable.",
    severity: "error",
    from: {},
    to: { circular: true },
  },
  {
    name: "domain-is-innermost",
    comment: "domain depends on nothing but itself: no use cases, adapters or platform code.",
    severity: "error",
    from: { path: "^src/modules/[^/]+/domain/" },
    to: { path: "^src/(modules/[^/]+/(application|infra|http)|platform|bootstrap)/" },
  },
  {
    name: "application-not-to-adapters",
    comment: "Use cases depend on ports they declare, never on infra or http adapters.",
    severity: "error",
    from: { path: "^src/modules/[^/]+/application/" },
    to: { path: "^src/modules/[^/]+/(infra|http)/" },
  },
  {
    name: "http-not-to-infra",
    comment: "Controllers call use cases; they never reach infrastructure directly.",
    severity: "error",
    from: { path: "^src/modules/[^/]+/http/" },
    to: { path: "^src/modules/[^/]+/infra/" },
  },
  {
    name: "modules-only-through-public-api",
    comment:
      "A module reaches another only through its application/public-api.ts or its Nest module file.",
    severity: "error",
    from: { path: "^src/modules/([^/]+)/" },
    to: {
      path: "^src/modules/",
      pathNot: [
        "^src/modules/$1/",
        "^src/modules/[^/]+/application/public-api\\.ts$",
        "^src/modules/[^/]+/[^/]+\\.module\\.ts$",
      ],
    },
  },
  {
    name: "platform-not-to-modules",
    comment: "Cross-cutting platform code must not know about business modules.",
    severity: "error",
    from: { path: "^src/platform/" },
    to: { path: "^src/(modules|bootstrap)/" },
  },
  {
    name: "src-not-to-test",
    comment: "Production code never imports test support code.",
    severity: "error",
    from: { path: "^src/" },
    to: { path: "^test/" },
  },
  {
    name: "no-dev-deps-in-production-code",
    comment: "Runtime code may only use runtime dependencies (type-only imports are fine).",
    severity: "error",
    from: { path: "^src/", pathNot: "\\.test\\.ts$" },
    to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["type-only"] },
  },
  {
    name: "not-to-unresolvable",
    comment: "Every import must resolve.",
    severity: "error",
    from: {},
    to: { couldNotResolve: true },
  },
];

/** @type {import("dependency-cruiser").ICruiseOptions} */
export const options = {
  doNotFollow: { path: "node_modules" },
  exclude: { path: "^test/fixtures/" },
  tsPreCompilationDeps: true,
  tsConfig: { fileName: "tsconfig.json" },
  enhancedResolveOptions: {
    exportsFields: ["exports"],
    conditionNames: ["import", "require", "node", "default", "types"],
    mainFields: ["module", "main", "types", "typings"],
  },
};

export default { forbidden, options };
