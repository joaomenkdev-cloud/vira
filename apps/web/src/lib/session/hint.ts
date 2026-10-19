/**
 * A hint, readable by the page, that this browser probably has a session. The session
 * cookies are `HttpOnly`, so without it every anonymous visit would have to ask the API
 * (and get a 401) just to draw the header. It decides only whether to ask: what the API
 * answers is what counts. `proxy.ts` sets it whenever a request carries the access
 * cookie (this covers the social login, which lands on a page from a redirect), the page
 * sets it after signing in, and clears it when the API says there is no session.
 */
export const SESSION_HINT_COOKIE = "vira_session";
/** As long as the longest a session can last (30 days, ADR-0005). */
export const SESSION_HINT_MAX_AGE = 30 * 24 * 60 * 60;
/** The access-token cookie the API sets (docs/API.md, "Autenticação"). */
export const ACCESS_COOKIE = "__Host-vira_at";

function attributes(maxAge: number): string {
  const secure = typeof location !== "undefined" && location.protocol === "https:";
  return `; Path=/; Max-Age=${String(maxAge)}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function setSessionHint(): void {
  document.cookie = `${SESSION_HINT_COOKIE}=1${attributes(SESSION_HINT_MAX_AGE)}`;
}

export function clearSessionHint(): void {
  document.cookie = `${SESSION_HINT_COOKIE}=${attributes(0)}`;
}

/** Whether this browser carries the hint (read in the browser only). */
export function hasSessionHint(): boolean {
  return document.cookie.split("; ").some((pair) => pair.startsWith(`${SESSION_HINT_COOKIE}=`));
}
