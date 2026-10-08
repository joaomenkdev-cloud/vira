import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { type Liveness, livenessSchema, type Readiness, readinessSchema } from "@vira/shared";
import type { Response } from "express";

import { Public } from "../../../platform/security/access-policy.js";
import { CheckReadiness } from "../application/check-readiness.js";

@ApiTags("Saúde")
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly checkReadiness: CheckReadiness) {}

  @Get("live")
  @ApiOperation({ summary: "O processo está no ar" })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: livenessSchema })
  live(): Liveness {
    return { status: "ok" };
  }

  @Get("ready")
  @ApiOperation({ summary: "As dependências (banco, Redis) estão acessíveis" })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: readinessSchema })
  @ApiResponse({ status: HttpStatus.SERVICE_UNAVAILABLE, standardSchema: readinessSchema })
  async ready(@Res({ passthrough: true }) res: Response): Promise<Readiness> {
    const readiness = await this.checkReadiness.execute();
    if (readiness.status !== "ok") res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return readiness;
  }
}
