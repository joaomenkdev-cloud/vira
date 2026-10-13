import type { CookieOptions, Response } from "express";

import { ACCESS_COOKIE, CSRF_COOKIE } from "../../../platform/security/cookies.js";
import type { SessionCredentials } from "../application/session-credentials.js";

/**
 * The refresh cookie is only sent to the authentication routes, so it never travels
 * with ordinary API calls. `__Secure-` instead of `__Host-` because of that narrower
 * path. Must match the global prefix (`api/v1`) and the controller path (`auth`).
 */
export const REFRESH_COOKIE = "__Secure-vira_rt";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

/**
 * Flags of every session cookie (ADR-0005): out of reach of page scripts, HTTPS only
 * (browsers also accept `Secure` cookies from http://localhost in development), and
 * not sent on cross-site subrequests or form posts.
 */
const BASE: CookieOptions = { httpOnly: true, secure: true, sameSite: "lax" };

const ACCESS_OPTIONS: CookieOptions = { ...BASE, path: "/" };
const REFRESH_OPTIONS: CookieOptions = { ...BASE, path: REFRESH_COOKIE_PATH };
const CSRF_OPTIONS: CookieOptions = { ...BASE, path: "/" };

/** Whole seconds until `expiresAt`, rounded up so the cookie never dies before its token. */
function maxAge(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / 1000) * 1000;
}

export function writeSessionCookies(
  response: Response,
  credentials: SessionCredentials,
  now: Date,
): void {
  response.cookie(ACCESS_COOKIE, credentials.accessToken, {
    ...ACCESS_OPTIONS,
    maxAge: maxAge(credentials.accessTokenExpiresAt, now),
  });
  response.cookie(REFRESH_COOKIE, credentials.refreshToken, {
    ...REFRESH_OPTIONS,
    maxAge: maxAge(credentials.refreshTokenExpiresAt, now),
  });
}

/** A CSRF token belongs to one session: after a new login, the previous one is useless. */
export function clearCsrfCookie(response: Response): void {
  response.clearCookie(CSRF_COOKIE, CSRF_OPTIONS);
}

/** Lives as long as the browser session; the page asks for a new one when it is gone. */
export function writeCsrfCookie(response: Response, token: string): void {
  response.cookie(CSRF_COOKIE, token, CSRF_OPTIONS);
}

export function clearSessionCookies(response: Response): void {
  response.clearCookie(ACCESS_COOKIE, ACCESS_OPTIONS);
  response.clearCookie(REFRESH_COOKIE, REFRESH_OPTIONS);
  response.clearCookie(CSRF_COOKIE, CSRF_OPTIONS);
}
