import { describe, expect, it } from "vitest";

import { resolveApiOrigin } from "./api-origin";

describe("resolveApiOrigin", () => {
  it("defaults to the local API outside deployments", () => {
    expect(resolveApiOrigin({})).toBe("http://127.0.0.1:3000");
  });

  it("is required in deployments", () => {
    expect(() => resolveApiOrigin({ VERCEL: "1" })).toThrow("API_ORIGIN is required");
    expect(() => resolveApiOrigin({ VERCEL: "1", API_ORIGIN: "" })).toThrow(
      "API_ORIGIN is required",
    );
  });

  it("accepts an https origin", () => {
    expect(resolveApiOrigin({ VERCEL: "1", API_ORIGIN: "https://api.vira.example" })).toBe(
      "https://api.vira.example",
    );
  });

  it("accepts plain http only for the loopback interface", () => {
    expect(resolveApiOrigin({ API_ORIGIN: "http://localhost:4000" })).toBe("http://localhost:4000");
    expect(() => resolveApiOrigin({ API_ORIGIN: "http://api.vira.example" })).toThrow(
      "must use https",
    );
  });

  it.each([
    ["not a url", "must be a valid URL"],
    ["ftp://api.vira.example", "must use http or https"],
    ["https://user:secret@api.vira.example", "must not contain credentials"],
    ["https://api.vira.example/api/v1", "origin only"],
    ["https://api.vira.example/?x=1", "origin only"],
  ])("rejects %s", (value, message) => {
    expect(() => resolveApiOrigin({ API_ORIGIN: value })).toThrow(message);
  });

  it("never repeats the offending value, which may hold credentials", () => {
    try {
      resolveApiOrigin({ API_ORIGIN: "https://user:hunter2@api.vira.example" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("hunter2");
    }
  });
});
