/**
 * Problem types of the API (docs/API.md#tipos-de-problema). The `type` URI points
 * to the matching anchor in the API documentation.
 */
export const PROBLEM_TYPES = {
  "validation-failed": { status: 400, title: "Requisição inválida" },
  unauthenticated: { status: 401, title: "Autenticação necessária" },
  forbidden: { status: 403, title: "Acesso negado" },
  "not-found": { status: 404, title: "Recurso não encontrado" },
  "payload-too-large": { status: 413, title: "Corpo da requisição muito grande" },
  "unsupported-media-type": { status: 415, title: "Tipo de conteúdo não suportado" },
  "rate-limited": { status: 429, title: "Muitas requisições" },
  "internal-error": { status: 500, title: "Erro interno" },
} as const satisfies Record<string, { status: number; title: string }>;

export type ProblemType = keyof typeof PROBLEM_TYPES;

export const PROBLEM_TYPE_BASE_URI =
  "https://github.com/joaomenkdev-cloud/vira/blob/main/docs/API.md#";

export function problemTypeUri(type: ProblemType): string {
  return `${PROBLEM_TYPE_BASE_URI}${type}`;
}

const TYPE_BY_STATUS = new Map<number, ProblemType>(
  Object.entries(PROBLEM_TYPES).map(([type, { status }]) => [status, type as ProblemType]),
);

export function problemTypeForStatus(status: number): ProblemType | undefined {
  return TYPE_BY_STATUS.get(status);
}
