import { describe, expect, it } from "vitest";

import { CheckReadiness, type DependencyCheck } from "./check-readiness.js";

const up = (name: string): DependencyCheck => ({ name, ping: () => Promise.resolve() });
const down = (name: string): DependencyCheck => ({
  name,
  ping: () => Promise.reject(new Error("connection refused")),
});
const hanging = (name: string): DependencyCheck => ({
  name,
  ping: () => new Promise(() => undefined),
});

describe("CheckReadiness", () => {
  it("is ready when there is nothing to check", async () => {
    await expect(new CheckReadiness([]).execute()).resolves.toEqual({ status: "ok", checks: {} });
  });

  it("is ready when every dependency answers", async () => {
    const readiness = await new CheckReadiness([up("database"), up("redis")]).execute();
    expect(readiness).toEqual({ status: "ok", checks: { database: "up", redis: "up" } });
  });

  it("is unavailable when any dependency fails", async () => {
    const readiness = await new CheckReadiness([up("database"), down("redis")]).execute();
    expect(readiness).toEqual({ status: "unavailable", checks: { database: "up", redis: "down" } });
  });

  it("treats a dependency that does not answer in time as down", async () => {
    const readiness = await new CheckReadiness([hanging("database")]).execute(20);
    expect(readiness).toEqual({ status: "unavailable", checks: { database: "down" } });
  });
});
