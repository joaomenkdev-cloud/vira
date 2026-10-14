import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./client";
import { ApiError } from "./errors";

const PROBLEM_BASE = "https://github.com/joaomenkdev-cloud/vira/blob/main/docs/API.md#";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function problem(status: number, code: string, headers: Record<string, string> = {}): Response {
  return json(status, { type: `${PROBLEM_BASE}${code}`, title: code, status }, headers);
}

type Handler = (path: string, init: RequestInit) => Response | Promise<Response>;

function fakeApi(handler: Handler) {
  const calls: { path: string; init: RequestInit }[] = [];
  const fetch = vi.fn((input: string, init: RequestInit) => {
    const path = input.replace(/^\/api\/v1/, "");
    calls.push({ path, init });
    return Promise.resolve(handler(path, init));
  });
  return { fetch, calls };
}

function header(init: RequestInit | undefined, name: string): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.[name];
}

describe("the API client", () => {
  it("calls the same-origin proxy with the cookies and JSON", async () => {
    const { fetch, calls } = fakeApi(() => json(200, { ok: true }));
    const api = createApiClient({ fetch });

    await expect(api.request("/me", { method: "PATCH", body: { name: "Ana" } })).resolves.toEqual({
      ok: true,
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/me", expect.anything());
    expect(calls[0]?.init).toMatchObject({
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ name: "Ana" }),
    });
    expect(header(calls[0]?.init, "content-type")).toBe("application/json");
  });

  it("returns nothing for 204", async () => {
    const api = createApiClient({
      fetch: fakeApi(() => new Response(null, { status: 204 })).fetch,
    });
    await expect(api.request("/auth/logout", { method: "POST" })).resolves.toBeUndefined();
  });

  it("turns problem details into an ApiError with the code and Retry-After", async () => {
    const api = createApiClient({
      fetch: fakeApi(() => problem(429, "rate-limited", { "retry-after": "61" })).fetch,
    });

    const error = await api.request("/auth/login", { method: "POST" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "rate-limited", retryAfterSeconds: 61 });
  });

  it("reports a network failure as such", async () => {
    const api = createApiClient({ fetch: () => Promise.reject(new TypeError("offline")) });
    await expect(api.request("/me")).rejects.toMatchObject({ code: "network-error", status: 0 });
  });

  describe("refresh", () => {
    it("refreshes once and retries when the access token expired", async () => {
      let refreshed = false;
      const { fetch, calls } = fakeApi((path) => {
        if (path === "/auth/refresh") {
          refreshed = true;
          return new Response(null, { status: 204 });
        }
        return refreshed ? json(200, { user: "ana" }) : problem(401, "unauthenticated");
      });
      const api = createApiClient({ fetch });

      await expect(api.request("/me")).resolves.toEqual({ user: "ana" });
      expect(calls.map((call) => call.path)).toEqual(["/me", "/auth/refresh", "/me"]);
    });

    it("shares one refresh between concurrent calls (a second one would revoke the session)", async () => {
      let refreshes = 0;
      let releaseRefresh: () => void = () => undefined;
      const { fetch } = fakeApi((path) => {
        if (path === "/auth/refresh") {
          refreshes += 1;
          return new Promise<Response>((resolve) => {
            releaseRefresh = () => {
              resolve(new Response(null, { status: 204 }));
            };
          });
        }
        return refreshes > 0 ? json(200, { path }) : problem(401, "unauthenticated");
      });
      const api = createApiClient({ fetch });

      const pending = Promise.all([
        api.request("/me"),
        api.request("/auth/sessions"),
        api.request("/me"),
      ]);
      await vi.waitFor(() => {
        expect(refreshes).toBe(1);
      });
      releaseRefresh();

      await expect(pending).resolves.toEqual([
        { path: "/me" },
        { path: "/auth/sessions" },
        { path: "/me" },
      ]);
      expect(refreshes).toBe(1);
    });

    it("takes the cross-tab lock around the refresh", async () => {
      const order: string[] = [];
      const locks = {
        request: vi.fn(async (name: string, callback: () => Promise<boolean>) => {
          order.push(`lock:${name}`);
          const result = await callback();
          order.push("unlock");
          return result;
        }),
      } as unknown as Pick<LockManager, "request">;
      const { fetch } = fakeApi((path) => {
        if (path === "/auth/refresh") {
          order.push("refresh");
          return new Response(null, { status: 204 });
        }
        return problem(401, "unauthenticated");
      });

      await createApiClient({ fetch, locks }).refreshSession();

      expect(order).toEqual(["lock:vira-session-refresh", "refresh", "unlock"]);
    });

    it("tells the page the session is over when the refresh fails, and retries no more", async () => {
      const { fetch, calls } = fakeApi(() => problem(401, "unauthenticated"));
      const api = createApiClient({ fetch });
      const lost = vi.fn();
      api.onSessionLost(lost);

      await expect(api.request("/me")).rejects.toMatchObject({ status: 401 });
      expect(calls.map((call) => call.path)).toEqual(["/me", "/auth/refresh"]);
      expect(lost).toHaveBeenCalledTimes(1);
    });

    it("does not refresh for the routes that open a session", async () => {
      const { fetch, calls } = fakeApi(() => problem(401, "invalid-credentials"));
      const api = createApiClient({ fetch });

      await expect(
        api.request("/auth/login", { method: "POST", body: {}, refresh: false }),
      ).rejects.toMatchObject({ code: "invalid-credentials" });
      expect(calls).toHaveLength(1);
    });
  });

  describe("CSRF", () => {
    it("fetches the token once and sends it on every call that asks for it", async () => {
      const { fetch, calls } = fakeApi((path) =>
        path === "/auth/csrf" ? json(200, { csrfToken: "t1" }) : json(200, {}),
      );
      const api = createApiClient({ fetch });

      await api.request("/me", { method: "PATCH", body: {}, csrf: true });
      await api.request("/me/password", { method: "POST", body: {}, csrf: true });
      await api.request("/me");

      expect(calls.map((call) => call.path)).toEqual(["/auth/csrf", "/me", "/me/password", "/me"]);
      expect(header(calls[1]?.init, "x-csrf-token")).toBe("t1");
      expect(header(calls[2]?.init, "x-csrf-token")).toBe("t1");
      expect(header(calls[3]?.init, "x-csrf-token")).toBeUndefined();
    });

    it("fetches a new token once when the API refuses the old one", async () => {
      let tokens = 0;
      const { fetch, calls } = fakeApi((path, init) => {
        if (path === "/auth/csrf") {
          tokens += 1;
          return json(200, { csrfToken: `t${String(tokens)}` });
        }
        return header(init, "x-csrf-token") === "t2" ? json(200, {}) : problem(403, "csrf-failed");
      });
      const api = createApiClient({ fetch });

      await api.request("/auth/logout", { method: "POST", csrf: true });

      expect(calls.map((call) => call.path)).toEqual([
        "/auth/csrf",
        "/auth/logout",
        "/auth/csrf",
        "/auth/logout",
      ]);
    });

    it("asks for a new token after the session changed", async () => {
      const { fetch, calls } = fakeApi((path) =>
        path === "/auth/csrf" ? json(200, { csrfToken: "t" }) : json(200, {}),
      );
      const api = createApiClient({ fetch });

      await api.request("/me", { method: "PATCH", csrf: true });
      api.sessionChanged();
      await api.request("/me", { method: "PATCH", csrf: true });

      expect(calls.filter((call) => call.path === "/auth/csrf")).toHaveLength(2);
    });
  });
});
