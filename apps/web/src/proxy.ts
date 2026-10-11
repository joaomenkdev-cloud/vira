import { type NextRequest, NextResponse } from "next/server";

import { buildCsp, generateNonce } from "./config/csp";

/**
 * Runs before every page: creates the nonce, sets the Content Security Policy on the
 * request (so Next.js can stamp its own scripts) and on the response.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp({ nonce, isDevelopment: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
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
