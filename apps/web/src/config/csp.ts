/**
 * Content Security Policy for pages (docs/SECURITY_MODEL.md, "Cabeçalhos").
 *
 * Scripts need the per-request nonce; `strict-dynamic` lets the scripts Next.js
 * loads from them run in turn. Nothing may be framed, embedded as an object, or
 * submitted to another origin. When the checkout arrives (delivery V6) the
 * Stripe origins are added to `script-src`, `frame-src` and `connect-src` here.
 */

export interface CspOptions {
  /** Fresh, unpredictable value generated for every request. */
  readonly nonce: string;
  /** Development needs `eval` (React debugging) and inline styles (hot reload). */
  readonly isDevelopment: boolean;
}

/** A random nonce, base64 encoded, different on every call. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildCsp({ nonce, isDevelopment }: CspOptions): string {
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", ...(isDevelopment ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    // Upgrading http subresources would break the plain-http development server.
    ...(isDevelopment ? {} : { "upgrade-insecure-requests": [] }),
  };

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}
