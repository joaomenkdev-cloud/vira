import { StandardSchemaValidationPipe } from "@nestjs/common";
import type { FieldError } from "@vira/shared";

import { ProblemException } from "./problem.exception.js";

type IssuePath = readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;

interface Issue {
  readonly message: string;
  readonly path?: IssuePath;
}

function formatPath(path: IssuePath): string {
  if (!path?.length) return "";
  return path
    .map((segment) => String(typeof segment === "object" ? segment.key : segment))
    .join(".");
}

export function toFieldErrors(issues: readonly Issue[]): FieldError[] {
  return issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message }));
}

/** Validates `@Body/@Query/@Param({ schema })` and reports failures as `validation-failed`. */
export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new ProblemException("validation-failed", { errors: toFieldErrors(issues) }),
  });
}
