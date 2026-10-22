import { Controller, Get, Header, HttpStatus, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { type DataExport, dataExportSchema, problemDetailsSchema } from "@vira/shared";
import type { Request, Response } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import {
  rateLimitHeaders,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import { AccountNotFoundError } from "../application/errors.js";
import { ExportAccountData } from "../application/export-account-data.js";

function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

/**
 * The account holder's copy of their data (docs/PRIVACY.md#4-direitos-do-titular-art-18).
 * The deletion of the account (`DELETE /me`) is in the `auth` module, which asks for the
 * password again and clears the session cookies.
 */
@ApiTags("Conta")
@RequireRole("BUYER")
@Controller("me")
export class DataExportController {
  constructor(private readonly exportData: ExportAccountData) {}

  @Get("export")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Baixa todos os dados da conta",
    description:
      "Um arquivo JSON (`format: vira.data-export.v1`) com a conta, os logins sociais, as " +
      "sessões ativas, o perfil de organizador e seus eventos, os pedidos e os ingressos. " +
      "Auditado como `user.data_exported`. Até 3 por dia por conta.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: dataExportSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async export(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DataExport> {
    const caller = callerOf(request);
    try {
      const data = await this.exportData.execute(
        { id: caller.id, role: caller.role },
        typeof request.id === "string" ? { requestId: request.id } : {},
      );
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="vira-meus-dados-${data.exportedAt.slice(0, 10)}.json"`,
      );
      return data;
    } catch (error) {
      // A valid access token for an account that no longer exists: there is no session.
      if (error instanceof AccountNotFoundError) throw new ProblemException("unauthenticated");
      if (error instanceof RateLimitExceededError) {
        throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
      }
      throw error;
    }
  }
}
