import { join } from "node:path";

import { cruise, type ICruiseResult } from "dependency-cruiser";
import { describe, expect, it } from "vitest";

import { forbidden } from "../.dependency-cruiser.js";

const FIXTURE_ROOT = join(import.meta.dirname, "fixtures", "layering");

async function violationsIn(baseDir: string): Promise<string[]> {
  const result = await cruise(["src"], {
    baseDir,
    validate: true,
    ruleSet: { forbidden },
    doNotFollow: { path: "node_modules" },
  });
  const output = result.output as ICruiseResult;
  return output.summary.violations.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`).sort();
}

describe("architecture rules (dependency-cruiser)", () => {
  it("catch each kind of layering violation and allow the sanctioned paths", async () => {
    expect(await violationsIn(FIXTURE_ROOT)).toEqual([
      "application-not-to-adapters: src/modules/orders/application/create-order.ts -> src/modules/orders/http/orders.controller.ts",
      "domain-is-innermost: src/modules/orders/domain/order.ts -> src/modules/orders/infra/order-repository.ts",
      "http-not-to-infra: src/modules/orders/http/orders.controller.ts -> src/modules/orders/infra/order-repository.ts",
      "modules-only-through-public-api: src/modules/orders/application/create-order.ts -> src/modules/payments/domain/payment.ts",
      "no-circular: src/platform/a.ts -> src/platform/b.ts",
      "platform-not-to-modules: src/platform/a.ts -> src/modules/orders/domain/order.ts",
    ]);
  });
});
