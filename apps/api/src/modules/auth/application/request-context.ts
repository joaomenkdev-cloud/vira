/** Per-request data the use cases pass on to the audit log. */
export interface RequestContext {
  /** Correlates audit entries with the request logs. */
  readonly requestId?: string;
}

/** The audit context's optional `requestId`, spread into it only when there is one. */
export function withRequestId(context: RequestContext): { requestId?: string } {
  return context.requestId === undefined ? {} : { requestId: context.requestId };
}
