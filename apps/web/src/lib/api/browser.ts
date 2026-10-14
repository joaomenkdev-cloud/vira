import { createApiClient } from "./client";

/** The one client of the page: the refresh lock and the CSRF token are shared by every call. */
export const api = createApiClient({
  fetch: (input, init) => fetch(input, init),
  locks: typeof navigator !== "undefined" && "locks" in navigator ? navigator.locks : undefined,
});
