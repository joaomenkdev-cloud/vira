import { describe, expect, it } from "vitest";

import { ConfigValidationError, loadConfig } from "./load-config.js";

const validEnv = { WEB_ORIGIN: "http://localhost:3001" };

function captureError(env: NodeJS.ProcessEnv): ConfigValidationError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigValidationError) return error;
    throw error;
  }
  throw new Error("expected loadConfig to throw");
}

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    expect(loadConfig(validEnv)).toEqual({
      env: "development",
      http: { host: "0.0.0.0", port: 3000, webOrigin: "http://localhost:3001", trustProxyHops: 0 },
      log: { level: "info", pretty: true },
      docs: { enabled: true },
    });
  });

  it("parses typed values from strings", () => {
    const config = loadConfig({
      ...validEnv,
      NODE_ENV: "test",
      PORT: "8080",
      TRUST_PROXY_HOPS: "1",
      API_DOCS_ENABLED: "false",
      LOG_LEVEL: "warn",
    });
    expect(config.http.port).toBe(8080);
    expect(config.http.trustProxyHops).toBe(1);
    expect(config.docs.enabled).toBe(false);
    expect(config.log).toEqual({ level: "warn", pretty: false });
  });

  it("normalizes the web origin", () => {
    expect(loadConfig({ WEB_ORIGIN: "https://vira.example/some/path" }).http.webOrigin).toBe(
      "https://vira.example",
    );
  });

  it("disables the API docs in production by default", () => {
    const config = loadConfig({ NODE_ENV: "production", WEB_ORIGIN: "https://vira.example" });
    expect(config.docs.enabled).toBe(false);
  });

  it("requires https for the web origin in production", () => {
    const error = captureError({ NODE_ENV: "production", WEB_ORIGIN: "http://vira.example" });
    expect(error.issues).toEqual([
      { variable: "WEB_ORIGIN", message: "must use https in production" },
    ]);
  });

  it("reports every invalid variable at once", () => {
    const error = captureError({ PORT: "0", LOG_LEVEL: "verbose" });
    expect(error.issues.map((i) => i.variable).sort()).toEqual(["LOG_LEVEL", "PORT", "WEB_ORIGIN"]);
  });

  it("never echoes the offending values, which may be secrets", () => {
    const secret = "s3cr3t-value-that-must-not-leak";
    const error = captureError({ WEB_ORIGIN: secret, PORT: secret, LOG_LEVEL: secret });
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error.issues)).not.toContain(secret);
  });
});
