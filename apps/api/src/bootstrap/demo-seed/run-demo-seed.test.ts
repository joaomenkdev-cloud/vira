import { describe, expect, it } from "vitest";

import { runDemoSeed } from "./run-demo-seed.js";

describe("db:seed:demo", () => {
  it("refuses arguments it does not know, before touching anything", async () => {
    const output: string[] = [];
    expect(await runDemoSeed(["--force"], {}, (line) => output.push(line))).toBe(1);
    expect(output).toEqual(["Unknown argument: --force. Usage: db:seed:demo [--reset]"]);
  });

  it("explains an invalid configuration instead of throwing", async () => {
    const output: string[] = [];
    expect(await runDemoSeed([], { NODE_ENV: "test" }, (line) => output.push(line))).toBe(1);
    expect(output.join("\n")).toMatch(/DATABASE_URL/);
  });
});
