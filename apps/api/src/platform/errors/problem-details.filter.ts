import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import { type FieldError, PROBLEM_CONTENT_TYPE, type ProblemDetails } from "@vira/shared";
import type { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import { ProblemException } from "./problem.exception.js";
import {
  PROBLEM_TYPES,
  type ProblemType,
  problemTypeForStatus,
  problemTypeUri,
} from "./problem-types.js";

/** Errors raised by Express middleware (e.g. body-parser) carry their own status. */
interface HttpLikeError {
  status: number;
  expose?: boolean;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 600
  );
}

/**
 * Turns every exception into an RFC 9457 `application/problem+json` response.
 * Unexpected errors become a generic 500: internals never reach the client,
 * and the `requestId` links the response to the logged stack trace.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(ProblemDetailsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const problem = this.toProblem(exception);
    if (problem.status >= 500) {
      this.logger.error({ err: exception }, "Unhandled exception");
    }

    const body: ProblemDetails = {
      ...problem,
      instance: request.originalUrl.split("?", 1)[0],
      requestId: typeof request.id === "string" ? request.id : undefined,
    };

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(body);
  }

  private toProblem(exception: unknown): Omit<ProblemDetails, "instance" | "requestId"> {
    if (exception instanceof ProblemException) {
      return this.build(exception.type, exception.options.detail, exception.options.errors);
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : isHttpLikeError(exception)
          ? exception.status
          : 500;

    const type = problemTypeForStatus(status);
    if (type && status < 500) return this.build(type);
    if (status < 500) return { type: "about:blank", title: "Requisição recusada", status };
    return this.build("internal-error");
  }

  private build(
    type: ProblemType,
    detail?: string,
    errors?: readonly FieldError[],
  ): Omit<ProblemDetails, "instance" | "requestId"> {
    const { status, title } = PROBLEM_TYPES[type];
    return {
      type: problemTypeUri(type),
      title,
      status,
      ...(detail === undefined ? {} : { detail }),
      ...(errors === undefined ? {} : { errors: [...errors] }),
    };
  }
}
