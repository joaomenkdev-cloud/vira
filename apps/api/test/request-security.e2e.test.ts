import { createHmac } from "node:crypto";

import { problemDetailsSchema } from "@vira/shared";
import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { problemTypeUri, type ProblemType } from "../src/platform/errors/problem-types.js";
import { AccessTokens } from "../src/platform/security/access-token.js";
import { ACCESS_COOKIE, CSRF_COOKIE } from "../src/platform/security/cookies.js";
import { CsrfTokens } from "../src/platform/security/csrf.js";
import {
  createTestApp,
  TEST_SECRETS,
  TEST_WEB_ORIGIN,
  type TestApp,
} from "./support/create-test-app.js";
import { FixturesModule } from "./support/fixtures.controller.js";

const USER_ID = "0192a7c0-0000-7000-8000-000000000001";
const SESSION_ID = "0192a7c0-0000-7000-8000-0000000000aa";
const OTHER_SESSION_ID = "0192a7c0-0000-7000-8000-0000000000bb";

function expectProblem(response: Response, type: ProblemType): void {
  expect(problemDetailsSchema.parse(response.body).type).toBe(problemTypeUri(type));
}

describe("request authentication and CSRF defences (no infrastructure)", () => {
  let testApp: TestApp;
  let accessTokens: AccessTokens;
  let csrfTokens: CsrfTokens;
  const api = () => request(testApp.app.getHttpServer());

  const tokenFor = (role: "BUYER" | "ORGANIZER", sid = SESSION_ID) =>
    accessTokens.issue({ sub: USER_ID, role, sid }).token;

  /** Cookies a logged-in browser would send, with a CSRF token for `csrfSession`. */
  function browser(role: "BUYER" | "ORGANIZER", csrfSession = SESSION_ID) {
    const csrf = csrfTokens.issue(csrfSession);
    return { cookie: `${ACCESS_COOKIE}=${tokenFor(role)}; ${CSRF_COOKIE}=${csrf}`, csrf };
  }

  beforeAll(async () => {
    testApp = await createTestApp({ imports: [FixturesModule] });
    accessTokens = testApp.app.get(AccessTokens);
    csrfTokens = testApp.app.get(CsrfTokens);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  describe("authentication", () => {
    it("accepts the access token from the cookie or the Bearer header, with its role", async () => {
      await api()
        .get("/api/v1/__test/organizer")
        .set("Cookie", `${ACCESS_COOKIE}=${tokenFor("ORGANIZER")}`)
        .expect(200, { reached: true });
      await api()
        .get("/api/v1/__test/organizer")
        .set("Authorization", `Bearer ${tokenFor("ORGANIZER")}`)
        .expect(200, { reached: true });

      const buyer = await api()
        .get("/api/v1/__test/organizer")
        .set("Authorization", `Bearer ${tokenFor("BUYER")}`)
        .expect(403);
      expectProblem(buyer, "forbidden");
    });

    it("treats an invalid, forged or unsigned token as no session", async () => {
      const [header, payload] = tokenFor("BUYER").split(".");
      const promoted = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(payload ?? "", "base64url").toString()),
          role: "ORGANIZER",
        }),
      ).toString("base64url");
      const none = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const signedWithCsrfKey = (() => {
        const input = `${header}.${promoted}`;
        return `${input}.${createHmac("sha256", TEST_SECRETS.CSRF_SECRET).update(input).digest("base64url")}`;
      })();

      for (const token of [
        "not-a-jwt",
        `${header}.${promoted}.${tokenFor("BUYER").split(".")[2]}`,
        `${none}.${promoted}.`,
        signedWithCsrfKey,
      ]) {
        const response = await api()
          .get("/api/v1/__test/organizer")
          .set("Cookie", `${ACCESS_COOKIE}=${token}`)
          .expect(401);
        expectProblem(response, "unauthenticated");
      }
    });

    it("judges a request that sends Authorization by that header alone", async () => {
      const response = await api()
        .get("/api/v1/__test/organizer")
        .set("Authorization", "Basic dXNlcjpwYXNz")
        .set("Cookie", `${ACCESS_COOKIE}=${tokenFor("ORGANIZER")}`)
        .expect(401);
      expectProblem(response, "unauthenticated");
    });
  });

  describe("CSRF token on routes that act with a cookie session", () => {
    it("accepts the token from the header when it matches the cookie and the session", async () => {
      const { cookie, csrf } = browser("BUYER");
      await api()
        .post("/api/v1/__test/buyer-action")
        .set("Cookie", cookie)
        .set("X-CSRF-Token", csrf)
        .expect(201, { reached: true });
    });

    it("refuses a missing, mismatched or foreign token with 403", async () => {
      const { cookie, csrf } = browser("BUYER");
      const foreign = browser("BUYER", OTHER_SESSION_ID);
      const cases: { cookie: string; header?: string }[] = [
        { cookie },
        { cookie: `${ACCESS_COOKIE}=${tokenFor("BUYER")}`, header: csrf },
        { cookie, header: csrfTokens.issue(SESSION_ID) },
        // Cookie and header agree, but the token was issued to another session.
        { cookie: foreign.cookie, header: foreign.csrf },
        { cookie, header: `${csrf}x` },
      ];
      for (const attempt of cases) {
        const call = api().post("/api/v1/__test/buyer-action").set("Cookie", attempt.cookie);
        if (attempt.header) call.set("X-CSRF-Token", attempt.header);
        const response = await call.expect(403);
        expectProblem(response, "csrf-failed");
        expect(response.body).not.toHaveProperty("reached");
      }
    });

    it("does not ask Bearer clients for a token", async () => {
      await api()
        .post("/api/v1/__test/buyer-action")
        .set("Authorization", `Bearer ${tokenFor("BUYER")}`)
        .expect(201);
    });

    it("answers 401 before 403 when there is no session at all", async () => {
      const response = await api().post("/api/v1/__test/buyer-action").expect(401);
      expectProblem(response, "unauthenticated");
    });
  });

  describe("origin of state-changing requests", () => {
    const echo = { title: "Show", quantity: 1 };

    it("refuses another Origin, even on public routes and with a valid token", async () => {
      for (const origin of ["https://evil.example", "null", `${TEST_WEB_ORIGIN}.evil.example`]) {
        const response = await api()
          .post("/api/v1/__test/echo")
          .set("Origin", origin)
          .send(echo)
          .expect(403);
        expectProblem(response, "csrf-failed");
      }
      const { cookie, csrf } = browser("BUYER");
      await api()
        .post("/api/v1/__test/buyer-action")
        .set("Origin", "https://evil.example")
        .set("Cookie", cookie)
        .set("X-CSRF-Token", csrf)
        .expect(403);
    });

    it("refuses cross-site and same-site fetches when the browser leaves Origin out", async () => {
      for (const site of ["cross-site", "same-site"]) {
        const response = await api()
          .post("/api/v1/__test/echo")
          .set("Sec-Fetch-Site", site)
          .send(echo)
          .expect(403);
        expectProblem(response, "csrf-failed");
      }
    });

    it("accepts our own origin and clients that are not browsers", async () => {
      await api().post("/api/v1/__test/echo").set("Origin", TEST_WEB_ORIGIN).send(echo).expect(201);
      await api()
        .post("/api/v1/__test/echo")
        .set("Sec-Fetch-Site", "same-origin")
        .send(echo)
        .expect(201);
      await api().post("/api/v1/__test/echo").send(echo).expect(201);
    });

    it("leaves safe methods alone", async () => {
      await api().get("/api/v1/health/live").set("Origin", "https://evil.example").expect(200);
    });
  });
});
