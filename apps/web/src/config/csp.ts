/**
 * Content Security Policy for pages (docs/SECURITY_MODEL.md, "Cabeçalhos").
 *
 * Scripts need the per-request nonce; `strict-dynamic` lets the scripts Next.js
 * loads from them run in turn. Nothing may be framed, embedded as an object, or
 * submitted to another origin. The one other origin scripts may reach is the object
 * storage, where the organizer panel sends event pictures with a pre-signed `PUT`
 * (docs/API.md, "Imagem do evento"). The checkout loads Stripe.js and its Payment
 * Element (ADR-0006): Stripe's script, its frames (the card fields and the bank's 3-D
 * Secure page) and its API, as Stripe documents for a Content Security Policy.
 */

const STRIPE_SCRIPTS = ["https://js.stripe.com", "https://*.js.stripe.com"] as const;
const STRIPE_FRAMES = [...STRIPE_SCRIPTS, "https://hooks.stripe.com"] as const;
const STRIPE_API = "https://api.stripe.com";

export interface CspOptions {
  /** Fresh, unpredictable value generated for every request. */
  readonly nonce: string;
  /** Development needs `eval` (React debugging) and inline styles (hot reload). */
  readonly isDevelopment: boolean;
  /** Origin of the object storage the event pictures are uploaded to. */
  readonly storageOrigin: string;
}

/** A random nonce, base64 encoded, different on every call. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

export function buildCsp({ nonce, isDevelopment, storageOrigin }: CspOptions): string {
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...STRIPE_SCRIPTS,
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", ...(isDevelopment ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", storageOrigin, STRIPE_API],
    "frame-src": [...STRIPE_FRAMES],
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
