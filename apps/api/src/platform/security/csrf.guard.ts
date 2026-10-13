import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/config.schema.js";
import { ProblemException } from "../errors/problem.exception.js";
import { ACCESS_POLICY, type AccessPolicy } from "./access-policy.js";
import { CSRF_COOKIE, readCookie } from "./cookies.js";
import { CSRF_HEADER, CsrfTokens, sameToken } from "./csrf.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** `none` is a navigation the person started (typed URL, bookmark), not another site. */
const ACCEPTED_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * CSRF defences on every state-changing request (ADR-0005, docs/SECURITY_MODEL.md 3.1),
 * on top of `SameSite=Lax` cookies:
 *
 * 1. **Origin.** A browser request must come from the web origin: `Origin` must match
 *    it exactly, or, when a browser leaves `Origin` out, `Sec-Fetch-Site` must say
 *    `same-origin`. Requests with neither header come from clients that are not
 *    browsers and cannot be forged by a page. This also covers login CSRF.
 * 2. **Token.** A request that acts with a session carried by the access cookie must
 *    also send the signed double-submit token: the `X-CSRF-Token` header equal to the
 *    CSRF cookie and valid for that session. Bearer tokens are never sent by the
 *    browser on its own, and public routes do not act with the session, so neither
 *    needs one.
 *
 * Runs after the access guard: a request without a session gets its `401` first.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly webOrigin: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: CsrfTokens,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.webOrigin = config.http.webOrigin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    if (!this.fromTrustedOrigin(request)) throw new ProblemException("csrf-failed");

    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const user = request.user;
    if (policy?.kind !== "role" || user?.credential !== "cookie") return true;

    const header = request.headers[CSRF_HEADER];
    const sent = typeof header === "string" ? header : "";
    // The signature is always checked; a missing header or cookie simply does not match.
    const valid =
      this.tokens.verify(sent, user.sessionId) &&
      sameToken(sent, readCookie(request, CSRF_COOKIE) ?? "");
    if (!valid) throw new ProblemException("csrf-failed");
    return true;
  }

  private fromTrustedOrigin(request: Request): boolean {
    const origin = request.headers.origin;
    if (origin !== undefined) return origin === this.webOrigin;
    const site = request.headers["sec-fetch-site"];
    if (typeof site === "string") return ACCEPTED_FETCH_SITES.has(site);
    return true;
  }
}
