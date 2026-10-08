import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

/** sslmode values that actually require an encrypted connection. */
const ENCRYPTED_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
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
    if (!env.REDIS_URL.startsWith("rediss://")) {
      ctx.addIssue({
        code: "custom",
        path: ["REDIS_URL"],
        message: "must use rediss:// in production",
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
    docs: {
      enabled: env.API_DOCS_ENABLED ?? env.NODE_ENV !== "production",
    },
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
  }));

export type AppConfig = z.output<typeof envSchema>;
export type LogLevel = (typeof LOG_LEVELS)[number];
