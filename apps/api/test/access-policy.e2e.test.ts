import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { problemDetailsSchema } from "@vira/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri } from "../src/platform/errors/problem-types.js";
import { ACCESS_POLICY, type AccessPolicy } from "../src/platform/security/access-policy.js";
import { createTestApp, type TestApp } from "./support/create-test-app.js";
import { FixturesModule } from "./support/fixtures.controller.js";

interface Route {
  readonly name: string;
  readonly policy: AccessPolicy | undefined;
}

/** Every HTTP handler registered in the application, with its declared access policy. */
function collectRoutes(testApp: TestApp): Route[] {
  const discovery = testApp.app.get(DiscoveryService);
  const scanner = testApp.app.get(MetadataScanner);
  const reflector = testApp.app.get(Reflector);

  return discovery.getControllers().flatMap(({ metatype, instance }) => {
    if (!metatype || !instance) return [];
    const prototype = Object.getPrototypeOf(instance) as object;
    return scanner.getAllMethodNames(prototype).flatMap((methodName) => {
      const handler = (prototype as Record<string, unknown>)[methodName];
      if (
        typeof handler !== "function" ||
        Reflect.getMetadata(PATH_METADATA, handler) === undefined
      ) {
        return [];
      }
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      return [
        {
          name: `${method} ${metatype.name}.${methodName}`,
          policy: reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
            handler,
            metatype,
          ]),
        },
      ];
    });
  });
}

describe("every application route declares an access policy", () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [DiscoveryModule] });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it("finds the application routes", () => {
    expect(collectRoutes(testApp).map((r) => r.name)).toContain("GET HealthController.live");
  });

  it("has no route without @Public() or @RequireRole()", () => {
    const undeclared = collectRoutes(testApp).filter((route) => route.policy === undefined);
    expect(undeclared.map((route) => route.name)).toEqual([]);
  });
});

describe("access guard", () => {
  let testApp: TestApp;
  const server = () => testApp.app.getHttpServer();

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [DiscoveryModule, FixturesModule] });
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it("the sweep detects routes that forget to declare a policy", () => {
    const undeclared = collectRoutes(testApp).filter((route) => route.policy === undefined);
    expect(undeclared.map((route) => route.name)).toEqual(["GET FixturesController.undeclared"]);
  });

  it("denies a route without a policy at runtime", async () => {
    const response = await request(server()).get("/api/v1/__test/undeclared").expect(403);
    expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri("forbidden"));
    expect(response.body).not.toHaveProperty("reached");
  });

  it("requires a session on role-protected routes", async () => {
    const response = await request(server()).get("/api/v1/__test/organizer").expect(401);
    expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri("unauthenticated"));
  });
});
