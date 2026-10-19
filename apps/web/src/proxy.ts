import { type NextRequest, NextResponse } from "next/server";

import { resolveStorageOrigin } from "./config/api-origin";
import { buildCsp, generateNonce } from "./config/csp";
import { ACCESS_COOKIE, SESSION_HINT_COOKIE, SESSION_HINT_MAX_AGE } from "./lib/session/hint";

const STORAGE_ORIGIN = resolveStorageOrigin(process.env);

/**
 * Runs before every page: creates the nonce, sets the Content Security Policy on the
 * request (so Next.js can stamp its own scripts) and on the response. It also notes the
 * session hint when the request carries the access cookie, which is how a social login
 * (a redirect straight to a page) is noticed (see `lib/session/hint.ts`).
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    storageOrigin: STORAGE_ORIGIN,
  });

  const newHint = request.cookies.has(ACCESS_COOKIE) && !request.cookies.has(SESSION_HINT_COOKIE);
  // On the request too, so this very page is drawn knowing about the session.
  if (newHint) request.cookies.set(SESSION_HINT_COOKIE, "1");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (newHint) {
    response.cookies.set(SESSION_HINT_COOKIE, "1", {
      path: "/",
      maxAge: SESSION_HINT_MAX_AGE,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the API proxy, build assets or the favicon.
      source: "/((?!api/|_next/static|_next/image|icon.svg|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
