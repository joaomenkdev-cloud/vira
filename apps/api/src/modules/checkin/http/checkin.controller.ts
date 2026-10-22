import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CheckinCodeRequest,
  checkinCodeRequestSchema,
  type CheckinResponseBody,
  checkinResponseSchema,
  type CheckinScanRequest,
  checkinScanRequestSchema,
  type CheckinStatsBody,
  checkinStatsSchema,
  problemDetailsSchema,
  resourceIdSchema,
} from "@vira/shared";
import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import {
  rateLimitHeaders,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import { CheckIn, type RequestContext } from "../application/check-in.js";
import { EventNotFoundError } from "../application/errors.js";
import { GetCheckinStats } from "../application/get-checkin-stats.js";
import { checkinBody, checkinStatsBody } from "./checkin-bodies.js";

function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

function contextOf(request: Request): RequestContext {
  return typeof request.id === "string" ? { requestId: request.id } : {};
}

/** Runs a use case and turns its expected failures into documented problems. */
async function asProblem<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof EventNotFoundError) throw new ProblemException("not-found");
    if (error instanceof RateLimitExceededError) {
      throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
    }
    throw error;
  }
}

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/**
 * The door of an event (docs/API.md#check-in-checkin): only its organizer reads tickets
 * there. The outcome of a read is a business answer, so it is always `200` with a
 * `result`; an event of someone else answers `404`, like one that does not exist.
 */
@ApiTags("Check-in")
@RequireRole("ORGANIZER")
@Controller()
export class CheckinController {
  constructor(
    private readonly checkIn: CheckIn,
    private readonly getStats: GetCheckinStats,
  ) {}

  @Post("checkin/scan")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Valida o QR Code de um ingresso na entrada",
    description:
      "Uso único: de duas leituras simultâneas, só uma recebe `VALID`. Até 120 leituras " +
      "por minuto por operador. Toda leitura fica registrada.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: checkinResponseSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.TOO_MANY_REQUESTS)
  async scan(
    @Body({ schema: checkinScanRequestSchema }) body: CheckinScanRequest,
    @Req() request: Request,
  ): Promise<CheckinResponseBody> {
    return checkinBody(
      await asProblem(() => this.checkIn.scan(callerOf(request), body, contextOf(request))),
    );
  }

  @Post("checkin/code")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Valida um ingresso pelo código impresso (VIRA-XXXX-XXXX)",
    description:
      "Para quando o QR não lê. Até 20 códigos por minuto por operador, para que não " +
      "possam ser adivinhados. Código de evento de outro organizador responde `INVALID`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: checkinResponseSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.TOO_MANY_REQUESTS)
  async code(
    @Body({ schema: checkinCodeRequestSchema }) body: CheckinCodeRequest,
    @Req() request: Request,
  ): Promise<CheckinResponseBody> {
    return checkinBody(
      await asProblem(() => this.checkIn.byCode(callerOf(request), body, contextOf(request))),
    );
  }

  @Get("organizer/events/:id/checkin/stats")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Quantos já entraram e as últimas leituras de um evento seu",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: checkinStatsSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  async stats(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<CheckinStatsBody> {
    return checkinStatsBody(await asProblem(() => this.getStats.execute(callerOf(request), id)));
  }
}
