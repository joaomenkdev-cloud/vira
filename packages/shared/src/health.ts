import { z } from "zod";

export const livenessSchema = z.object({ status: z.literal("ok") }).meta({ id: "Liveness" });

export const dependencyStatusSchema = z.enum(["up", "down"]);

export const readinessSchema = z
  .object({
    status: z.enum(["ok", "unavailable"]),
    checks: z.record(z.string(), dependencyStatusSchema),
  })
  .meta({ id: "Readiness" });

export type Liveness = z.infer<typeof livenessSchema>;
export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type Readiness = z.infer<typeof readinessSchema>;
