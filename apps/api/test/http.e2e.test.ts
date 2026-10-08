import { PROBLEM_CONTENT_TYPE, type ProblemDetails, problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { createTestApp, TEST_WEB_ORIGIN, type TestApp } from "./support/create-test-app.js";
import { FixturesModule, LEAKY_ERROR_MESSAGE } from "./support/fixtures.controller.js";

let testApp: TestApp;
const server = () => testApp.app.getHttpServer();

beforeAll(async () => {
  testApp = await createTestApp({ imports: [FixturesModule] });
});

afterAll(async () => {
  await testApp.app.close();
});

function expectProblem(response: request.Response, status: number, type: string): ProblemDetails {
  expect(response.status).toBe(status);
  expect(response.headers["content-type"]).toContain(PROBLEM_CONTENT_TYPE);
  const body = problemDetailsSchema.parse(response.body);
  expect(body.type).toBe(type);
  expect(body.status).toBe(status);
  expect(body.requestId).toBe(response.headers["x-request-id"]);
  return body;
}

describe("health", () => {
  it("reports liveness", async () => {
    const response = await request(server()).get("/api/v1/health/live").expect(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("reports readiness", async () => {
    const response = await request(server()).get("/api/v1/health/ready").expect(200);
    expect(response.body).toEqual({ status: "ok", checks: {} });
  });
});

describe("security headers", () => {
  it("locks down API responses", async () => {
    const response = await request(server()).get("/api/v1/health/live");
    expect(response.headers["content-security-policy"]).toBe(
      "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'",
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["strict-transport-security"]).toBeDefined();
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("adds a request id to every response", async () => {
    const response = await request(server()).get("/api/v1/health/live");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("CORS", () => {
  it("allows the web origin with credentials", async () => {
    const response = await request(server())
      .options("/api/v1/health/live")
      .set("Origin", TEST_WEB_ORIGIN)
      .set("Access-Control-Request-Method", "POST");
    expect(response.headers["access-control-allow-origin"]).toBe(TEST_WEB_ORIGIN);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow other origins", async () => {
    const response = await request(server())
      .options("/api/v1/health/live")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("problem details (RFC 9457)", () => {
  it("answers unknown routes with not-found", async () => {
    const response = await request(server()).get("/api/v1/does-not-exist");
    const problem = expectProblem(response, 404, problemTypeUri("not-found"));
    expect(problem.instance).toBe("/api/v1/does-not-exist");
  });

  it("lists every invalid field", async () => {
    const response = await request(server())
      .post("/api/v1/__test/echo")
      .send({ title: "x", quantity: 0, extra: true });
    const problem = expectProblem(response, 400, problemTypeUri("validation-failed"));
    const paths = (problem.errors ?? []).map((e) => e.path).sort();
    expect(paths).toEqual(["", "quantity", "title"]);
  });

  it("passes valid bodies through", async () => {
    const response = await request(server())
      .post("/api/v1/__test/echo")
      .send({ title: "Show", quantity: 2 })
      .expect(201);
    expect(response.body).toEqual({ title: "Show", quantity: 2 });
  });

  it("rejects malformed JSON", async () => {
    const response = await request(server())
      .post("/api/v1/__test/echo")
      .set("Content-Type", "application/json")
      .send('{"title":');
    expectProblem(response, 400, problemTypeUri("validation-failed"));
  });

  it("rejects bodies over 100 kB", async () => {
    const response = await request(server())
      .post("/api/v1/__test/echo")
      .send({ title: "x".repeat(110 * 1024), quantity: 1 });
    expectProblem(response, 413, problemTypeUri("payload-too-large"));
  });

  it("hides internal details of unexpected errors", async () => {
    const response = await request(server()).get("/api/v1/__test/boom");
    const problem = expectProblem(response, 500, problemTypeUri("internal-error"));
    expect(JSON.stringify(problem)).not.toContain("hunter2");
    expect(problem.detail).toBeUndefined();
  });

  it("logs unexpected errors with the request id", async () => {
    const response = await request(server()).get("/api/v1/__test/boom");
    const entry = testApp.logs
      .map(
        (line) =>
          JSON.parse(line) as { msg?: string; requestId?: string; err?: { message?: string } },
      )
      .find(
        (log) =>
          log.msg === "Unhandled exception" && log.requestId === response.headers["x-request-id"],
      );
    expect(entry?.err?.message).toBe(LEAKY_ERROR_MESSAGE);
  });
});
