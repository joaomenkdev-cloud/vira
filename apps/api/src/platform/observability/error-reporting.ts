import * as Sentry from "@sentry/node";

import type { AppConfig } from "../config/config.schema.js";

export type ReportingService = "api" | "worker";

/** Anything shaped like an e-mail address, wherever it shows up in a message. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
export const EMAIL_MASK = "[email]";

const maskEmails = (text: string) => text.replace(EMAIL_PATTERN, EMAIL_MASK);

let enabled = false;

/**
 * Starts error reporting when a DSN is configured. Only errors are sent: no tracing, no
 * breadcrumbs and no automatic request data, and every event goes through `scrubEvent`
 * first (docs/PRIVACY.md). Returns whether reporting is on.
 */
export function initErrorReporting(
  config: AppConfig,
  service: ReportingService,
  // Tests replace the transport to read what would be sent.
  { transport }: Pick<Sentry.NodeOptions, "transport"> = {},
): boolean {
  const reporting = config.errorReporting;
  if (!reporting) return false;
  Sentry.init({
    dsn: reporting.dsn,
    environment: reporting.environment,
    ...(reporting.release ? { release: reporting.release } : {}),
    // Nothing about people or requests is collected automatically.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Only the hooks that catch crashes: the default set also records requests, console
    // lines and local variables, any of which may hold personal data.
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubEvent(event),
    initialScope: { tags: { service } },
    ...(transport ? { transport } : {}),
  });
  enabled = true;
  return true;
}

/**
 * Keeps what explains the error (type, stack, release, tags) and drops whatever may say
 * who was involved. Pure, so the rule is tested without sending anything.
 */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  const scrubbed: T = { ...event };
  delete scrubbed.user;
  delete scrubbed.request;
  delete scrubbed.extra;
  delete scrubbed.breadcrumbs;
  delete scrubbed.server_name;
  if (scrubbed.message) scrubbed.message = maskEmails(scrubbed.message);
  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((exception) => ({
        ...exception,
        ...(exception.value ? { value: maskEmails(exception.value) } : {}),
        ...(exception.stacktrace?.frames
          ? {
              stacktrace: {
                ...exception.stacktrace,
                frames: exception.stacktrace.frames.map((frame) => {
                  const { vars: _vars, ...rest } = frame;
                  return rest;
                }),
              },
            }
          : {}),
      })),
    };
  }
  return scrubbed;
}

/** Sends an unexpected error, when reporting is on; a no-op otherwise. */
export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  if (!enabled) return;
  Sentry.captureException(error, { tags });
}
