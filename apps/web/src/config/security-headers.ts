export interface Header {
  readonly key: string;
  readonly value: string;
}

/**
 * Headers every response carries. The Content Security Policy is added per request
 * by `proxy.ts`, because it contains a nonce.
 */
export const securityHeaders: readonly Header[] = [
  // Two years, subdomains included. Browsers ignore the header on plain http.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The camera is enabled only on the check-in route when that screen exists (V8).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Redundant with CSP frame-ancestors; covers browsers that ignore it.
  { key: "X-Frame-Options", value: "DENY" },
];
