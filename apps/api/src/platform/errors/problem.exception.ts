import type { FieldError } from "@vira/shared";

import { PROBLEM_TYPES, type ProblemType } from "./problem-types.js";

export interface ProblemOptions {
  /** Human-readable explanation specific to this occurrence. Never include personal data. */
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
}

/** An expected failure that maps to one documented problem type. */
export class ProblemException extends Error {
  readonly status: number;

  constructor(
    readonly type: ProblemType,
    readonly options: ProblemOptions = {},
  ) {
    super(options.detail ?? PROBLEM_TYPES[type].title);
    this.name = "ProblemException";
    this.status = PROBLEM_TYPES[type].status;
  }
}
