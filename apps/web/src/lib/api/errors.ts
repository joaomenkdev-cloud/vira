import type { FieldError, ProblemDetails } from "@vira/shared";

/** The problem types the web reacts to (docs/API.md, "Tipos de problema"). */
export type ProblemCode =
  | "validation-failed"
  | "breached-password"
  | "incorrect-password"
  | "unauthenticated"
  | "invalid-credentials"
  | "csrf-failed"
  | "email-not-verified"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "password-not-set"
  | "already-organizer"
  | "token-expired"
  | "invalid-state-transition"
  | "invalid-image"
  | "rate-limited"
  | "payload-too-large"
  | "internal-error"
  /** The request never got an answer (offline, DNS). */
  | "network-error"
  /**
   * A 5xx without problem details: it came from the proxy, not from the API (the API
   * is down or unreachable from the web server).
   */
  | "unavailable"
  /** Any other answer, including `about:blank`. */
  | "unknown";

const KNOWN_CODES = new Set<string>([
  "validation-failed",
  "breached-password",
  "incorrect-password",
  "unauthenticated",
  "invalid-credentials",
  "csrf-failed",
  "email-not-verified",
  "forbidden",
  "not-found",
  "conflict",
  "password-not-set",
  "already-organizer",
  "token-expired",
  "invalid-state-transition",
  "invalid-image",
  "rate-limited",
  "payload-too-large",
  "internal-error",
]);

/** A failed call: the HTTP status, the problem type as a short code and the body, if any. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ProblemCode;
  readonly problem: ProblemDetails | undefined;
  /** From `Retry-After` on a `429`. */
  readonly retryAfterSeconds: number | undefined;

  constructor(options: {
    status: number;
    code: ProblemCode;
    problem?: ProblemDetails | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    super(options.problem?.title ?? `Request failed with status ${String(options.status)}`);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.problem = options.problem;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  /**
   * Field-level errors of `validation-failed` and `breached-password`, and what an
   * event still lacks in `invalid-state-transition`.
   */
  get fieldErrors(): readonly FieldError[] {
    return this.problem?.errors ?? [];
  }
}

/**
 * The anchor of the problem `type` (`.../API.md#token-expired` → `token-expired`).
 * Only the anchor is compared: the base URL is documentation, not a contract.
 */
export function problemCodeOf(type: string | undefined, status: number): ProblemCode {
  const anchor = type?.slice(type.lastIndexOf("#") + 1);
  if (anchor !== undefined && KNOWN_CODES.has(anchor)) return anchor as ProblemCode;
  if (status === 429) return "rate-limited";
  if (status === 401) return "unauthenticated";
  return "unknown";
}

function isProblem(value: unknown): value is ProblemDetails {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "number" &&
    typeof (value as { title?: unknown }).title === "string"
  );
}

function retryAfterOf(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

/** Reads a failed response into an `ApiError`, whatever its body turns out to be. */
export async function toApiError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails | undefined;
  try {
    const body: unknown = await response.json();
    if (isProblem(body)) problem = body;
  } catch {
    // Not JSON (a proxy error page, an empty body): the status is all there is.
  }
  const fromProxy = problem === undefined && response.status >= 500;
  return new ApiError({
    status: response.status,
    code: fromProxy ? "unavailable" : problemCodeOf(problem?.type, response.status),
    problem,
    retryAfterSeconds: retryAfterOf(response),
  });
}
