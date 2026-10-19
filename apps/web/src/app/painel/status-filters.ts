import type { EventStatus } from "@vira/shared";

/** The chips above the list: `?status=` in Portuguese, the API's status behind it. */
export interface StatusFilter {
  param: string | undefined;
  label: string;
  status: EventStatus | undefined;
}

export const STATUS_FILTERS: readonly [StatusFilter, ...StatusFilter[]] = [
  { param: undefined, label: "Todos", status: undefined },
  { param: "rascunhos", label: "Rascunhos", status: "DRAFT" },
  { param: "publicados", label: "Publicados", status: "PUBLISHED" },
  { param: "cancelados", label: "Cancelados", status: "CANCELED" },
];

export function filterHref(filter: StatusFilter): string {
  return filter.param === undefined ? "/painel" : `/painel?status=${filter.param}`;
}
