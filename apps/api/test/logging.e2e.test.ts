import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { REDACTED } from "../src/platform/logging/pino-options.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";
import { FixturesModule } from "./support/fixtures.controller.js";

interface LogEntry {
  msg?: string;
  requestId?: string;
  req?: Record<string, unknown>;
  [key: string]: unknown;
}

let testApp: TestApp;
const server = () => testApp.app.getHttpServer();
const entries = (): LogEntry[] => testApp.logs.map((line) => JSON.parse(line) as LogEntry);

beforeAll(async () => {
  testApp = await createTestApp({ imports: [FixturesModule] });
});

afterAll(async () => {
  await testApp.app.close();
});

describe("request id", () => {
  it("tags every log line of a request with its id", async () => {
    const response = await request(server()).get("/api/v1/__test/log");
    const requestId = response.headers["x-request-id"];

    const lines = entries().filter((entry) => entry.requestId === requestId);
    expect(lines.map((entry) => entry.msg)).toEqual(["fixture event", "request completed"]);
  });

  it("keeps a well-formed id sent by the caller", async () => {
    const response = await request(server())
      .get("/api/v1/__test/log")
      .set("X-Request-Id", "web-proxy-0123456789");
    expect(response.headers["x-request-id"]).toBe("web-proxy-0123456789");
  });

  it("replaces ids that could inject content into logs", async () => {
    const response = await request(server())
      .get("/api/v1/__test/log")
      .set("X-Request-Id", 'abc"} {"level":60');
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("personal data", () => {
  it("redacts personal data and credentials at any depth", async () => {
    const response = await request(server()).get("/api/v1/__test/log");
    const entry = entries().find(
      (e) => e.msg === "fixture event" && e.requestId === response.headers["x-request-id"],
    );

    expect(entry).toMatchObject({
      user: { id: "u1", email: REDACTED, name: REDACTED },
      password: REDACTED,
      order: { buyer: { buyerEmail: REDACTED } },
    });
  });

  it("never logs headers, cookies, query strings or client addresses", async () => {
    const response = await request(server())
      .get("/api/v1/__test/log?q=maria%40example.com")
      .set("Authorization", "Bearer secret-token")
      .set("Cookie", "__Host-vira_at=secret-cookie");
    const lines = testApp.logs.filter((line) =>
      line.includes(String(response.headers["x-request-id"])),
    );

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain("secret-token");
      expect(line).not.toContain("secret-cookie");
      expect(line).not.toContain("maria");
      expect(line).not.toContain("remoteAddress");
    }
    const completed = entries().find(
      (e) => e.msg === "request completed" && e.requestId === response.headers["x-request-id"],
    );
    expect(completed?.req).toEqual({
      id: response.headers["x-request-id"],
      method: "GET",
      path: "/api/v1/__test/log",
    });
  });
});
