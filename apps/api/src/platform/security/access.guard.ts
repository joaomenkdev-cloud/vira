import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { ProblemException } from "../errors/problem.exception.js";
import {
  ACCESS_POLICY,
  type AccessPolicy,
  type AuthenticatedUser,
  decideAccess,
} from "./access-policy.js";

declare module "express" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectPinoLogger(AccessGuard.name) private readonly logger: PinoLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<Request>();
    const decision = decideAccess(policy, request.user);

    switch (decision) {
      case "allow":
        return true;
      case "unauthenticated":
        throw new ProblemException("unauthenticated");
      case "forbidden":
        throw new ProblemException("forbidden");
      case "undeclared":
        this.logger.error(
          { handler: `${context.getClass().name}.${context.getHandler().name}` },
          "Route has no access policy; denying by default",
        );
        throw new ProblemException("forbidden");
    }
  }
}
