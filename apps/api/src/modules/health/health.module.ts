import { Module } from "@nestjs/common";

import {
  CheckReadiness,
  DEPENDENCY_CHECKS,
  type DependencyCheck,
} from "./application/check-readiness.js";
import { HealthController } from "./http/health.controller.js";

// Database and Redis checks are registered here once those adapters exist (F4).
const dependencyChecks: DependencyCheck[] = [];

@Module({
  controllers: [HealthController],
  providers: [CheckReadiness, { provide: DEPENDENCY_CHECKS, useValue: dependencyChecks }],
})
export class HealthModule {}
