import { describe, expect, it } from "vitest";

import { isLoopback, resolveApiOrigin, resolveSiteUrl, resolveStorageOrigin } from "./api-origin";

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

describe("resolveStorageOrigin", () => {
  it("defaults to the local SeaweedFS outside deployments", () => {
    expect(resolveStorageOrigin({})).toBe("http://127.0.0.1:8333");
  });

  it("is required in deployments and must be https there", () => {
    expect(() => resolveStorageOrigin({ VERCEL: "1" })).toThrow("STORAGE_ORIGIN is required");
    expect(() => resolveStorageOrigin({ STORAGE_ORIGIN: "http://r2.example" })).toThrow(
      "STORAGE_ORIGIN must use https",
    );
    expect(
      resolveStorageOrigin({
        VERCEL: "1",
        STORAGE_ORIGIN: "https://acct.r2.cloudflarestorage.com",
      }),
    ).toBe("https://acct.r2.cloudflarestorage.com");
  });

  it("is an origin only: the bucket is part of each signed address", () => {
    expect(() =>
      resolveStorageOrigin({ STORAGE_ORIGIN: "https://acct.r2.cloudflarestorage.com/vira" }),
    ).toThrow("origin only");
  });
});

describe("resolveSiteUrl", () => {
  it("defaults to the local web app", () => {
    expect(resolveSiteUrl({})).toBe("http://localhost:3001");
  });

  it("prefers SITE_URL, then the production domain Vercel provides", () => {
    expect(resolveSiteUrl({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "vira.vercel.app" })).toBe(
      "https://vira.vercel.app",
    );
    expect(
      resolveSiteUrl({
        VERCEL: "1",
        VERCEL_PROJECT_PRODUCTION_URL: "vira.vercel.app",
        SITE_URL: "https://vira.example",
      }),
    ).toBe("https://vira.example");
    expect(() => resolveSiteUrl({ VERCEL: "1" })).toThrow("SITE_URL is required");
  });
});

describe("isLoopback", () => {
  it.each([
    ["http://127.0.0.1:8333", true],
    ["http://localhost:3000", true],
    ["https://acct.r2.cloudflarestorage.com", false],
  ])("%s → %s", (origin, expected) => {
    expect(isLoopback(origin)).toBe(expected);
  });
});
