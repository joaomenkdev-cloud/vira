import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { run } from "./run.js";

describe("run", () => {
  it("refuses to start when the environment is invalid", async () => {
    const create = vi.spyOn(NestFactory, "create");
    const errors: string[] = [];

    const exitCode = await run(
      { NODE_ENV: "production", PORT: "hunter2" },
      { writeError: (message) => errors.push(message) },
    );
    const output = errors.join("\n");

    expect(exitCode).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(output).toContain("WEB_ORIGIN");
    expect(output).toContain("PORT");
    expect(output).not.toContain("hunter2");
  });
});
