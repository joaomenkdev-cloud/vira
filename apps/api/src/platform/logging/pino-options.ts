import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Options } from "pino-http";

import type { AppConfig } from "../config/config.schema.js";

export const REQUEST_ID_HEADER = "x-request-id";

/** Incoming ids are accepted only when they cannot inject anything into logs. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Keys that hold personal data or credentials. Their values are censored wherever
 * they appear up to three levels deep in a log entry (docs/PRIVACY.md).
 */
const SENSITIVE_KEYS = [
  "password",
  "currentPassword",
  "newPassword",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "qrToken",
  "csrfToken",
  "secret",
  "authorization",
  "cookie",
  "email",
  "buyerEmail",
  "name",
  "buyerName",
  "holderName",
  "displayName",
];

export const REDACTED = "[REDACTED]";

export const REDACT_PATHS = [
  'req.headers["authorization"]',
  'req.headers["cookie"]',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", id);
  return id;
}

/** Path without the query string: queries may carry free text typed by users. */
function pathOf(url: string | undefined): string | undefined {
  return url?.split("?", 1)[0];
}

export function pinoHttpOptions(config: AppConfig): Options {
  return {
    level: config.log.level,
    base: { service: "vira-api", env: config.env },
    genReqId: resolveRequestId,
    // Top-level request id on every line, including logs written inside handlers.
    customProps: (req) => ({ requestId: req.id }),
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    // Only what is needed to trace a request: no headers, body or client IP.
    serializers: {
      req: (req: { id: unknown; method: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        path: pathOf(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    autoLogging: {
      ignore: (req) => pathOf(req.url)?.startsWith("/api/v1/health/") ?? false,
    },
  };
}
