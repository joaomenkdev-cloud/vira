import type { Role } from "@vira/shared";

/** The caller, as the access token describes them. */
export interface Caller {
  readonly id: string;
  readonly role: Role;
}

export interface RequestContext {
  readonly requestId?: string;
}

export function auditContext(caller: Caller, context: RequestContext) {
  return {
    actor: { id: caller.id, role: caller.role },
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
  };
}
