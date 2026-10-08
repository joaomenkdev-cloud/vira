import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "./support/create-test-app.js";

let testApp: TestApp | undefined;

afterEach(async () => {
  await testApp?.app.close();
  testApp = undefined;
});

describe("OpenAPI", () => {
  it("documents the API from the shared Zod contracts", async () => {
    testApp = await createTestApp();
    const response = await request(testApp.app.getHttpServer()).get("/docs/json").expect(200);
    const document = response.body as {
      info: { title: string };
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
      components: { schemas: Record<string, unknown> };
    };

    expect(document.info.title).toBe("Vira API");
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(["/api/v1/health/live", "/api/v1/health/ready"]),
    );
    expect(JSON.stringify(document.paths["/api/v1/health/ready"])).toContain(
      "#/components/schemas/Readiness",
    );
    expect(JSON.stringify(document.components.schemas["Readiness"])).toContain("unavailable");
    expect(document.paths["/api/v1/health/ready"]?.["get"]?.responses).toHaveProperty("503");
  });

  it("serves the interactive UI with its own content security policy", async () => {
    testApp = await createTestApp();
    const response = await request(testApp.app.getHttpServer()).get("/docs").expect(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
  });

  it("can be disabled (the production default)", async () => {
    testApp = await createTestApp({ env: { API_DOCS_ENABLED: "false" } });
    await request(testApp.app.getHttpServer()).get("/docs/json").expect(404);
  });
});
