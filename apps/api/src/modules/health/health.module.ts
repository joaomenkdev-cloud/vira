import { Module } from "@nestjs/common";

import { CheckReadiness, DEPENDENCY_CHECKS } from "./application/check-readiness.js";
import { HealthController } from "./http/health.controller.js";
import { DEPENDENCY_CHECK_FACTORY } from "./infra/dependency-checks.js";

@Module({
  controllers: [HealthController],
  providers: [CheckReadiness, { provide: DEPENDENCY_CHECKS, ...DEPENDENCY_CHECK_FACTORY }],
})
export class HealthModule {}
