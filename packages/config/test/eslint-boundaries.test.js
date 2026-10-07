import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { viraConfig } from "../eslint/index.js";

/** @param {"app" | "package"} kind */
const linterFor = (kind) =>
  new ESLint({
    cwd: import.meta.dirname,
    overrideConfigFile: true,
    overrideConfig: viraConfig({ kind, typeChecked: false }),
  });

const app = linterFor("app");
const pkg = linterFor("package");

/**
 * Lints `code` as if it lived at `filePath` (relative to the workspace root).
 *
 * @param {ESLint} eslint
 * @param {string} filePath
 * @param {string} code
 */
async function lint(eslint, filePath, code) {
  const [result] = await eslint.lintText(`${code}\nexport {};\n`, { filePath });
  if (!result) throw new Error("ESLint returned no result");
  return result.messages;
}

/**
 * @param {ESLint} eslint
 * @param {string} filePath
 * @param {string} code
 */
async function restrictedImports(eslint, filePath, code) {
  const messages = await lint(eslint, filePath, code);
  return messages.filter((m) => m.ruleId === "no-restricted-imports");
}

describe("workspace boundaries", () => {
  // Relative escapes such as "../../api/src" carry no "apps" segment; dependency-cruiser
  // catches those by resolving the real path.
  it("forbids an app from importing another app by package name", async () => {
    const messages = await restrictedImports(app, "src/page.ts", 'import "@vira/api/modules/orders";');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/Apps never import other apps/);
  });

  it("forbids reaching into apps through a path", async () => {
    const messages = await restrictedImports(app, "src/page.ts", 'import "../../../apps/api/src/main";');
    expect(messages).toHaveLength(1);
  });

  it("forbids packages from importing apps", async () => {
    const messages = await restrictedImports(
      pkg,
      "src/index.ts",
      'import "@vira/web";\nimport "../../../apps/api/src/main";',
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]?.message).toMatch(/Packages must not depend on apps/);
  });

  it("allows apps to import shared packages", async () => {
    const messages = await restrictedImports(
      app,
      "src/page.ts",
      'import "@vira/shared";\nimport "@vira/ui/button";',
    );
    expect(messages).toHaveLength(0);
  });
});

describe("layer boundaries", () => {
  const domainFile = "src/modules/orders/domain/order.ts";
  const applicationFile = "src/modules/orders/application/create-order.ts";
  const httpFile = "src/modules/orders/http/orders.controller.ts";
  const infraFile = "src/modules/orders/infra/prisma-order-repository.ts";

  it("keeps the domain free of frameworks", async () => {
    const messages = await restrictedImports(app, domainFile, 'import "@nestjs/common";');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/domain layer is pure/);
  });

  it("keeps the domain free of infrastructure SDKs", async () => {
    const messages = await restrictedImports(
      app,
      domainFile,
      'import "@prisma/client";\nimport "stripe";\nimport "bullmq";',
    );
    expect(messages).toHaveLength(3);
  });

  it("still applies workspace rules inside the domain", async () => {
    const messages = await restrictedImports(app, domainFile, 'import "@vira/web";');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/Apps never import other apps/);
  });

  it("lets the domain import its own module and shared packages", async () => {
    const messages = await restrictedImports(
      app,
      domainFile,
      'import "./money";\nimport "@vira/shared";',
    );
    expect(messages).toHaveLength(0);
  });

  it("forbids infrastructure SDKs in use cases", async () => {
    const messages = await restrictedImports(app, applicationFile, 'import "@prisma/client";');
    expect(messages).toHaveLength(1);
    expect(messages[0]?.message).toMatch(/depend on ports/);
  });

  it("allows dependency injection in use cases", async () => {
    const messages = await restrictedImports(app, applicationFile, 'import "@nestjs/common";');
    expect(messages).toHaveLength(0);
  });

  it("forbids infrastructure SDKs in controllers", async () => {
    const messages = await restrictedImports(app, httpFile, 'import "stripe";');
    expect(messages).toHaveLength(1);
  });

  it("allows infrastructure SDKs in the infra layer", async () => {
    const messages = await restrictedImports(
      app,
      infraFile,
      'import "@prisma/client";\nimport "stripe";',
    );
    expect(messages).toHaveLength(0);
  });
});

describe("base rules", () => {
  it("rejects console usage outside tests", async () => {
    const messages = await lint(app, "src/main.ts", 'console.log("x");');
    expect(messages.map((m) => m.ruleId)).toContain("no-console");
  });

  it("allows console usage in tests", async () => {
    const messages = await lint(app, "src/main.test.ts", 'console.log("x");');
    expect(messages.map((m) => m.ruleId)).not.toContain("no-console");
  });

  it("requires type-only imports to be marked", async () => {
    const messages = await lint(
      pkg,
      "src/x.ts",
      'import { Foo } from "./foo";\nexport const x: Foo = {} as Foo;',
    );
    expect(messages.map((m) => m.ruleId)).toContain("@typescript-eslint/consistent-type-imports");
  });

  it("requires tsconfigRootDir for type-aware linting", () => {
    expect(() => viraConfig({ kind: "app" })).toThrow(/tsconfigRootDir is required/);
  });
});
