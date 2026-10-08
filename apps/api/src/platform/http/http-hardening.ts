import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import type { AppConfig } from "../config/config.schema.js";
import { DOCS_PATH } from "../openapi/setup-openapi.js";

/** Maximum JSON body accepted by the API (docs/API.md). */
export const JSON_BODY_LIMIT = "100kb";

/** The API only returns JSON: nothing may be loaded, framed or submitted from it. */
const apiHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: "same-site" },
});

/** Swagger UI needs its own scripts and inline styles. */
const docsHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
});

function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const middleware = req.path.startsWith(`/${DOCS_PATH}`) ? docsHeaders : apiHeaders;
  middleware(req, res, next);
}

/** API responses may carry personal data: never store them in shared caches. */
function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  next();
}

export function applyHttpHardening(app: NestExpressApplication, config: AppConfig): void {
  app.set("trust proxy", config.http.trustProxyHops);
  app.disable("x-powered-by");
  app.use(securityHeaders, noStore);
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  app.enableCors({
    origin: [config.http.webOrigin],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key", "X-Request-Id"],
    exposedHeaders: [
      "X-Request-Id",
      "Retry-After",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ],
    maxAge: 600,
  });
}
