import type { Request } from "express";

/**
 * Cookie names (ADR-0005). The `__Host-` prefix makes the browser refuse the cookie
 * unless it is `Secure`, has `Path=/` and no `Domain`, so a sibling subdomain cannot
 * plant or overwrite it; `__Secure-` only demands `Secure` (the refresh cookie needs a
 * narrower path).
 */
export const ACCESS_COOKIE = "__Host-vira_at";
export const CSRF_COOKIE = "__Host-vira_csrf";

/** Far above any cookie we set; a larger header is not parsed. */
const MAX_COOKIE_HEADER_LENGTH = 8 * 1024;

/**
 * The value of one cookie from the request's `Cookie` header, or `undefined`. When the
 * name repeats (a cookie set for another path or by a sibling host), the first one
 * wins: browsers send the most specific path first.
 */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (typeof header !== "string" || header.length > MAX_COOKIE_HEADER_LENGTH) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    return value === "" ? undefined : value;
  }
  return undefined;
}
