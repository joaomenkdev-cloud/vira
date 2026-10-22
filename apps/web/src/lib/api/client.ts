import { ApiError, toApiError } from "./errors";

/**
 * The browser's door to the API. Every call goes to `/api/v1/*` on the web origin,
 * which Next forwards to the API, so the session cookies are first-party and page
 * scripts never see them (ADR-0005).
 *
 * Two rules of the API shape this client:
 *
 * - **One refresh at a time.** Each refresh token works once, and presenting a spent
 *   one revokes the whole session (N4, strict reuse detection). So concurrent calls
 *   that find the access token expired share a single `POST /auth/refresh`, and tabs
 *   take turns through the Web Locks API: the second tab refreshes with the cookie the
 *   first one just received.
 * - **CSRF.** Routes that act with the session need the token of `GET /auth/csrf` in
 *   `X-CSRF-Token`. It is fetched once, kept in memory, and fetched again when the API
 *   says it no longer matches (a login in another tab replaces the cookie).
 */

const API_PREFIX = "/api/v1";
const REFRESH_LOCK = "vira-session-refresh";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  /** The route acts with the session and changes data: send the CSRF token. */
  csrf?: boolean;
  /**
   * Refresh the session and try once more when the access token has expired. Off for
   * the routes that open a session (a `401` there means wrong credentials).
   */
  refresh?: boolean;
  /** Extra request headers, such as the `Idempotency-Key` of a purchase. */
  headers?: Readonly<Record<string, string>>;
}

export interface ApiClientDependencies {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** `navigator.locks` in the browser; without it, refreshes are serialised per tab only. */
  locks?: Pick<LockManager, "request"> | undefined;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  /** Renews the session. Resolves to false when there is no session left to renew. */
  refreshSession(): Promise<boolean>;
  /** Forget the CSRF token: a new session (login, e-mail verification) needs another. */
  sessionChanged(): void;
  /** Called when a refresh fails: the session is over (expired, revoked, logged out). */
  onSessionLost(listener: () => void): () => void;
}

export function createApiClient({ fetch, locks }: ApiClientDependencies): ApiClient {
  let refreshing: Promise<boolean> | null = null;
  let csrfToken: Promise<string> | null = null;
  const sessionLostListeners = new Set<() => void>();

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${API_PREFIX}${path}`, {
        ...init,
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      throw new ApiError({ status: 0, code: "network-error" });
    }
  }

  async function postRefresh(): Promise<boolean> {
    const response = await send("/auth/refresh", {
      method: "POST",
      headers: { accept: "application/json" },
    });
    return response.ok;
  }

  async function runRefresh(): Promise<boolean> {
    let renewed: boolean;
    try {
      renewed = locks ? await locks.request(REFRESH_LOCK, postRefresh) : await postRefresh();
    } catch (error) {
      // Offline is not the end of the session: the next call can try again.
      if (error instanceof ApiError && error.code === "network-error") throw error;
      renewed = false;
    }
    if (!renewed) {
      csrfToken = null;
      for (const listener of sessionLostListeners) listener();
    }
    return renewed;
  }

  function refreshSession(): Promise<boolean> {
    refreshing ??= runRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function fetchCsrfToken(): Promise<string> {
    const response = await send("/auth/csrf", { headers: { accept: "application/json" } });
    if (!response.ok) throw await toApiError(response);
    const body = (await response.json()) as { csrfToken: string };
    return body.csrfToken;
  }

  function currentCsrfToken(): Promise<string> {
    if (csrfToken === null) {
      const pending = fetchCsrfToken();
      csrfToken = pending;
      // A failed fetch must not stay cached.
      pending.catch(() => {
        if (csrfToken === pending) csrfToken = null;
      });
    }
    return csrfToken;
  }

  async function attempt(
    path: string,
    options: RequestOptions,
    retried: { refresh: boolean; csrf: boolean },
  ): Promise<Response> {
    const { method = "GET", body, csrf = false, refresh = true } = options;
    const headers: Record<string, string> = { ...options.headers, accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (csrf) headers["x-csrf-token"] = await currentCsrfToken();

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await send(path, init);

    if (response.status === 401 && refresh && !retried.refresh) {
      if (await refreshSession()) return attempt(path, options, { ...retried, refresh: true });
    }
    if (response.status === 403 && csrf && !retried.csrf) {
      const error = await toApiError(response.clone());
      if (error.code === "csrf-failed") {
        csrfToken = null;
        return attempt(path, options, { ...retried, csrf: true });
      }
    }
    return response;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    let response: Response;
    try {
      response = await attempt(path, options, { refresh: false, csrf: false });
    } catch (error) {
      // No session to fetch a CSRF token for: the same as any other 401.
      if (error instanceof ApiError && error.status === 401 && options.refresh !== false) {
        if (await refreshSession()) return request<T>(path, { ...options, refresh: false });
      }
      throw error;
    }
    if (!response.ok) throw await toApiError(response);
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  return {
    request,
    refreshSession,
    sessionChanged() {
      csrfToken = null;
    },
    onSessionLost(listener) {
      sessionLostListeners.add(listener);
      return () => {
        sessionLostListeners.delete(listener);
      };
    },
  };
}
