import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { AccessTokens } from "./access-token.js";
import { ACCESS_COOKIE, readCookie } from "./cookies.js";

const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;

/**
 * Sets `request.user` from a valid access token: the `Authorization: Bearer` header
 * (clients that are not browsers) or, without that header, the access cookie. An
 * invalid or expired token leaves the request anonymous; the access guard then
 * answers `401` on routes that need a session, and public routes keep working.
 */
export function authenticateRequests(tokens: AccessTokens): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const header = request.headers.authorization;
    // A request that names its credential is judged by that credential alone.
    const credential =
      header !== undefined
        ? { token: BEARER.exec(header)?.[1] ?? "", kind: "bearer" as const }
        : { token: readCookie(request, ACCESS_COOKIE) ?? "", kind: "cookie" as const };

    // Always verified: a missing token is just one that does not verify.
    const subject = tokens.verify(credential.token);
    if (subject) {
      request.user = {
        id: subject.sub,
        role: subject.role,
        sessionId: subject.sid,
        credential: credential.kind,
      };
    }
    next();
  };
}
