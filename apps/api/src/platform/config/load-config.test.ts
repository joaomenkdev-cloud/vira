import { describe, expect, it } from "vitest";

import { ConfigValidationError, loadConfig } from "./load-config.js";

const validEnv = {
  WEB_ORIGIN: "http://localhost:3001",
  DATABASE_URL: "postgresql://vira:vira_local@127.0.0.1:5432/vira",
  REDIS_URL: "redis://127.0.0.1:6379",
};

const productionEnv = {
  NODE_ENV: "production",
  WEB_ORIGIN: "https://vira.example",
  DATABASE_URL: "postgresql://vira:pw@db.example/vira?sslmode=require",
  REDIS_URL: "rediss://default:pw@cache.example:6379",
};

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
      database: { url: validEnv.DATABASE_URL },
      redis: { url: validEnv.REDIS_URL },
      worker: { mode: "separate", outboxPollIntervalMs: 5_000 },
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
    const config = loadConfig({ ...validEnv, WEB_ORIGIN: "https://vira.example/some/path" });
    expect(config.http.webOrigin).toBe("https://vira.example");
  });

  it("reads the worker mode and the outbox polling interval", () => {
    const config = loadConfig({
      ...validEnv,
      WORKER_MODE: "embedded",
      OUTBOX_POLL_INTERVAL_MS: "250",
    });
    expect(config.worker).toEqual({ mode: "embedded", outboxPollIntervalMs: 250 });
  });

  it("rejects an unknown worker mode and a polling interval that would hammer Redis", () => {
    const error = captureError({
      ...validEnv,
      WORKER_MODE: "inline",
      OUTBOX_POLL_INTERVAL_MS: "5",
    });
    expect(error.issues.map((i) => i.variable).sort()).toEqual([
      "OUTBOX_POLL_INTERVAL_MS",
      "WORKER_MODE",
    ]);
  });

  it("rejects connection strings for the wrong service", () => {
    const error = captureError({
      ...validEnv,
      DATABASE_URL: "mysql://vira@db/vira",
      REDIS_URL: "http://cache.example",
    });
    expect(error.issues.map((i) => i.variable).sort()).toEqual(["DATABASE_URL", "REDIS_URL"]);
  });

  describe("in production", () => {
    it("accepts encrypted connections and disables the API docs by default", () => {
      expect(loadConfig(productionEnv).docs.enabled).toBe(false);
    });

    it("requires https for the web origin", () => {
      const error = captureError({ ...productionEnv, WEB_ORIGIN: "http://vira.example" });
      expect(error.issues).toEqual([
        { variable: "WEB_ORIGIN", message: "must use https in production" },
      ]);
    });

    it("requires TLS to the database", () => {
      for (const url of [
        "postgresql://vira:pw@db.example/vira",
        "postgresql://vira:pw@db.example/vira?sslmode=prefer",
      ]) {
        const error = captureError({ ...productionEnv, DATABASE_URL: url });
        expect(error.issues.map((i) => i.variable)).toEqual(["DATABASE_URL"]);
      }
    });

    it("requires TLS to Redis", () => {
      const error = captureError({ ...productionEnv, REDIS_URL: "redis://cache.example:6379" });
      expect(error.issues).toEqual([
        { variable: "REDIS_URL", message: "must use rediss:// in production" },
      ]);
    });
  });

  it("reports every invalid variable at once", () => {
    const error = captureError({ PORT: "0", LOG_LEVEL: "verbose" });
    expect(error.issues.map((i) => i.variable).sort()).toEqual([
      "DATABASE_URL",
      "LOG_LEVEL",
      "PORT",
      "REDIS_URL",
      "WEB_ORIGIN",
    ]);
  });

  it("never echoes the offending values, which may be secrets", () => {
    const secret = "s3cr3t-value-that-must-not-leak";
    const error = captureError({
      WEB_ORIGIN: secret,
      PORT: secret,
      LOG_LEVEL: secret,
      DATABASE_URL: `mysql://vira:${secret}@db/vira`,
      REDIS_URL: secret,
    });
    expect(error.message).not.toContain(secret);
    expect(JSON.stringify(error.issues)).not.toContain(secret);
  });

  it("never echoes database passwords from production rule failures", () => {
    const error = captureError({
      ...productionEnv,
      DATABASE_URL: "postgresql://vira:hunter2@db.example/vira",
    });
    expect(error.message).not.toContain("hunter2");
  });
});
