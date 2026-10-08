import { z } from "zod";

/** Field-level validation error carried by `validation-failed` problems. */
export const fieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/**
 * Error body of every failed API response: RFC 9457 Problem Details plus the
 * request id used to correlate with logs (docs/API.md).
 */
export const problemDetailsSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int().min(400).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    errors: z.array(fieldErrorSchema).optional(),
  })
  .meta({ id: "ProblemDetails" });

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = "application/problem+json";
