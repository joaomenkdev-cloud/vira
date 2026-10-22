import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/** sslmode values that actually require an encrypted connection. */
const ENCRYPTED_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

/** Used when MAIL_FROM is not set (development and tests only). */
export const DEFAULT_MAIL_FROM = "Vira <no-reply@vira.localhost>";

/** A bare address or `Display Name <address>`. */
const MAIL_FROM_PATTERN = /^(?:[^<>@\r\n]*<)?[^<>@\s]+@[^<>@\s]+>?$/;

/** SMTP over TLS from the first byte (smtps://) or STARTTLS made mandatory (requireTLS=true). */
function smtpUsesTls(smtpUrl: string): boolean {
  const url = new URL(smtpUrl);
  return url.protocol === "smtps:" || url.searchParams.get("requireTLS") === "true";
}

/**
 * HMAC keys (JWT_SECRET, CSRF_SECRET): at least 256 bits. 32 random bytes in base64
 * (`openssl rand -base64 32`) are 44 characters.
 */
const SECRET_MIN_LENGTH = 43;
const secretSchema = z
  .string()
  .min(SECRET_MIN_LENGTH, `must have at least ${SECRET_MIN_LENGTH} characters (256 bits)`);

/** OAuth client credentials: opaque strings issued by the provider's console. */
const oauthCredentialSchema = z.string().trim().min(1).max(512).optional();

/** Both halves of a provider's credentials, or neither (the provider is then off). */
const OAUTH_CREDENTIAL_PAIRS = [
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
] as const;

function oauthClient(
  clientId: string | undefined,
  clientSecret: string | undefined,
): { clientId: string; clientSecret: string } | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** S3 credentials: opaque strings issued by the storage provider (R2 API token, SeaweedFS). */
const storageCredentialSchema = z.string().trim().min(1).max(512);

/**
 * Stripe keys (ADR-0006). Only test-mode keys are accepted: the demo must never move real
 * money. A live key is refused by name, so the error says why.
 */
const STRIPE_KEY_PATTERN = {
  STRIPE_SECRET_KEY: /^sk_test_[A-Za-z0-9]{10,255}$/,
  STRIPE_PUBLISHABLE_KEY: /^pk_test_[A-Za-z0-9]{10,255}$/,
} as const;
const stripeKeySchema = z.string().trim().max(300).optional();

/**
 * QR signing keys (ADR-0008): `kid:key` pairs separated by commas, the first one signing
 * and all of them verifying, so a key can be rotated without voiding issued tickets. Each
 * key is at least 256 bits in base64 or base64url (`openssl rand -base64 32`).
 */
const QR_KEY_ID_PATTERN = /^[a-z0-9]{1,16}$/;
const QR_KEY_MIN_BYTES = 32;
const qrSigningKeysSchema = z
  .string()
  .trim()
  .max(4096)
  .transform((value, ctx) => {
    const keys: { kid: string; key: Buffer }[] = [];
    for (const entry of value.split(",")) {
      const [kid, encoded, ...rest] = entry.trim().split(":");
      if (!kid || !encoded || rest.length > 0 || !QR_KEY_ID_PATTERN.test(kid)) {
        ctx.addIssue({
          code: "custom",
          message: "must be kid:key pairs separated by commas (kid: 1-16 of a-z, 0-9)",
        });
        return z.NEVER;
      }
      const key = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      if (key.length < QR_KEY_MIN_BYTES || !/^[A-Za-z0-9+/_-]+=*$/.test(encoded)) {
        ctx.addIssue({
          code: "custom",
          message: `key "${kid}" must be base64 of at least ${QR_KEY_MIN_BYTES} bytes (256 bits)`,
        });
        return z.NEVER;
      }
      if (keys.some((k) => k.kid === kid)) {
        ctx.addIssue({ code: "custom", message: `key id "${kid}" is repeated` });
        return z.NEVER;
      }
      keys.push({ kid, key });
    }
    return keys;
  });

function usesTls(databaseUrl: string): boolean {
  const sslMode = new URL(databaseUrl).searchParams.get("sslmode");
  return sslMode !== null && ENCRYPTED_SSL_MODES.has(sslMode);
}

/**
 * Environment variables accepted by the API. Every variable is documented in
 * `.env.example`; the process refuses to start when any of them is invalid.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
    WEB_ORIGIN: z.url({ protocol: /^https?$/, normalize: true }),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
    API_DOCS_ENABLED: z.stringbool().optional(),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    WORKER_MODE: z.enum(["separate", "embedded"]).default("separate"),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }),
    MAIL_FROM: z.string().max(200).regex(MAIL_FROM_PATTERN).optional(),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).max(60_000).default(5_000),
    JWT_SECRET: secretSchema,
    CSRF_SECRET: secretSchema,
    QR_SIGNING_KEYS: qrSigningKeysSchema,
    GOOGLE_CLIENT_ID: oauthCredentialSchema,
    GOOGLE_CLIENT_SECRET: oauthCredentialSchema,
    GITHUB_CLIENT_ID: oauthCredentialSchema,
    GITHUB_CLIENT_SECRET: oauthCredentialSchema,
    PWNED_PASSWORDS_ENABLED: z.stringbool().optional(),
    PWNED_PASSWORDS_URL: z.url({ protocol: /^https?$/ }).default("https://api.pwnedpasswords.com"),
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
    S3_REGION: z.string().trim().min(1).max(64).default("auto"),
    // Bucket naming rules shared by S3, R2 and SeaweedFS.
    S3_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    S3_ACCESS_KEY_ID: storageCredentialSchema,
    S3_SECRET_ACCESS_KEY: storageCredentialSchema,
    PAYMENTS_MODE: z.enum(["test"]).default("test"),
    STRIPE_SECRET_KEY: stripeKeySchema,
    STRIPE_PUBLISHABLE_KEY: stripeKeySchema,
    // The signing secret of the webhook endpoint (Stripe dashboard or `stripe listen`).
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .trim()
      .regex(/^whsec_[A-Za-z0-9]{10,255}$/, "must be a webhook signing secret (whsec_...)")
      .optional(),
    // Error reporting (Sentry): off without a DSN. RENDER_GIT_COMMIT is set by Render.
    SENTRY_DSN: z
      .url({ protocol: /^https$/ })
      .max(500)
      .optional(),
    SENTRY_ENVIRONMENT: z
      .string()
      .trim()
      .regex(/^[a-z0-9_-]{1,64}$/)
      .optional(),
    SENTRY_RELEASE: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._@+-]{1,200}$/)
      .optional(),
    RENDER_GIT_COMMIT: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{7,64}$/)
      .optional(),
  })
  .superRefine((env, ctx) => {
    // One key per purpose: a CSRF token must never verify as a JWT signature, or vice versa.
    if (env.JWT_SECRET === env.CSRF_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["CSRF_SECRET"],
        message: "must differ from JWT_SECRET",
      });
    }
    for (const [id, secret] of OAUTH_CREDENTIAL_PAIRS) {
      if ((env[id] === undefined) !== (env[secret] === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [env[id] === undefined ? id : secret],
          message: `must be set together with ${env[id] === undefined ? secret : id}`,
        });
      }
    }
    for (const [variable, pattern] of Object.entries(STRIPE_KEY_PATTERN)) {
      const key = env[variable as keyof typeof STRIPE_KEY_PATTERN];
      if (key === undefined || pattern.test(key)) continue;
      ctx.addIssue({
        code: "custom",
        path: [variable],
        message: /^(sk|pk|rk)_live_/.test(key)
          ? "live keys are refused: PAYMENTS_MODE=test accepts only test-mode keys"
          : `must be a test-mode key (${variable === "STRIPE_SECRET_KEY" ? "sk_test_" : "pk_test_"}...)`,
      });
    }
    if ((env.STRIPE_SECRET_KEY === undefined) !== (env.STRIPE_PUBLISHABLE_KEY === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [
          env.STRIPE_SECRET_KEY === undefined ? "STRIPE_SECRET_KEY" : "STRIPE_PUBLISHABLE_KEY",
        ],
        message: "STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must be set together",
      });
    }
    if (env.NODE_ENV !== "production") return;
    for (const variable of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const) {
      if (env[variable] !== undefined) continue;
      ctx.addIssue({ code: "custom", path: [variable], message: "is required in production" });
    }
    // Every hop is encrypted in production (docs/SECURITY_MODEL.md, ASVS V12).
    if (!env.WEB_ORIGIN.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "must use https in production",
      });
    }
    if (!usesTls(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "must set sslmode=require (or verify-ca/verify-full) in production",
      });
    }
    if (!smtpUsesTls(env.SMTP_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_URL"],
        message: "must use smtps:// or set requireTLS=true in production",
      });
    }
    if (env.MAIL_FROM === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_FROM"],
        message: "is required in production",
      });
    }
    if (!env.REDIS_URL.startsWith("rediss://")) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "must use rediss:// in production",
      });
    }
    if (!env.S3_ENDPOINT.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_ENDPOINT"],
        message: "must use https in production",
      });
    }
  })
  .transform((env) => ({
    env: env.NODE_ENV,
    http: {
      host: env.HOST,
      port: env.PORT,
      webOrigin: new URL(env.WEB_ORIGIN).origin,
      trustProxyHops: env.TRUST_PROXY_HOPS,
    },
    log: {
      level: env.LOG_LEVEL,
      pretty: env.NODE_ENV === "development",
    },
    /** Unexpected errors go to Sentry, scrubbed of personal data (docs/PRIVACY.md). */
    errorReporting: env.SENTRY_DSN
      ? {
          dsn: env.SENTRY_DSN,
          environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
          release: env.SENTRY_RELEASE ?? env.RENDER_GIT_COMMIT,
        }
      : undefined,
    docs: {
      enabled: env.API_DOCS_ENABLED ?? env.NODE_ENV !== "production",
    },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    mail: { smtpUrl: env.SMTP_URL, from: env.MAIL_FROM ?? DEFAULT_MAIL_FROM },
    /**
     * Private bucket of the event pictures (ADR-0011, ADR-0012): Cloudflare R2 in
     * production, SeaweedFS locally. Browsers reach the endpoint too, through the
     * pre-signed URLs, so it must be an address they can open.
     */
    storage: {
      endpoint: env.S3_ENDPOINT.replace(/\/+$/, ""),
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    /**
     * Stripe, in test mode only (ADR-0006). Without keys (development, tests) payments are
     * off: starting one answers `503`.
     */
    payments: {
      mode: env.PAYMENTS_MODE,
      stripe:
        env.STRIPE_SECRET_KEY && env.STRIPE_PUBLISHABLE_KEY
          ? { secretKey: env.STRIPE_SECRET_KEY, publishableKey: env.STRIPE_PUBLISHABLE_KEY }
          : undefined,
      /** Without it the webhook refuses every event (`503`): nothing can be verified. */
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    /** The first key signs the QR tokens of new views; all of them verify (ADR-0008). */
    tickets: { qrSigningKeys: env.QR_SIGNING_KEYS },
    worker: { mode: env.WORKER_MODE, outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS },
    auth: {
      jwtSecret: env.JWT_SECRET,
      csrfSecret: env.CSRF_SECRET,
      /** A provider without credentials is off: its routes answer `404`. */
      oauth: {
        google: oauthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
        github: oauthClient(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
      },
      /**
       * Leaked-password check (Have I Been Pwned, k-anonymity). On by default; tests turn
       * it off unless they ask for it, so no suite depends on the real service.
       */
      pwnedPasswords: {
        enabled: env.PWNED_PASSWORDS_ENABLED ?? env.NODE_ENV !== "test",
        baseUrl: env.PWNED_PASSWORDS_URL.replace(/\/+$/, ""),
      },
    },
  }));

export type AppConfig = z.output<typeof envSchema>;
export type LogLevel = (typeof LOG_LEVELS)[number];
