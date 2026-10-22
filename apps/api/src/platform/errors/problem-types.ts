/**
 * Problem types of the API (docs/API.md#tipos-de-problema). The `type` URI points
 * to the matching anchor in the API documentation.
 */
export const PROBLEM_TYPES = {
  "validation-failed": { status: 400, title: "Requisição inválida" },
  "breached-password": { status: 400, title: "Senha encontrada em vazamentos" },
  "incorrect-password": { status: 400, title: "Senha atual incorreta" },
  "invalid-signature": { status: 400, title: "Assinatura do webhook inválida" },
  unauthenticated: { status: 401, title: "Autenticação necessária" },
  "invalid-credentials": { status: 401, title: "E-mail ou senha inválidos" },
  "reauthentication-required": { status: 401, title: "Entre de novo para confirmar" },
  forbidden: { status: 403, title: "Acesso negado" },
  "email-not-verified": { status: 403, title: "E-mail ainda não verificado" },
  "csrf-failed": { status: 403, title: "Requisição de origem não confirmada" },
  "not-found": { status: 404, title: "Recurso não encontrado" },
  conflict: { status: 409, title: "Conflito com o estado atual do recurso" },
  "password-not-set": { status: 409, title: "A conta não tem senha" },
  "already-organizer": { status: 409, title: "A conta já tem perfil de organizador" },
  "organizer-has-upcoming-events": {
    status: 409,
    title: "O organizador tem eventos publicados por acontecer",
  },
  "invalid-state-transition": { status: 409, title: "Operação incompatível com o estado atual" },
  "insufficient-inventory": { status: 409, title: "Ingressos insuficientes" },
  "pending-order-exists": { status: 409, title: "Já existe um pedido pendente para este evento" },
  "request-in-progress": { status: 409, title: "Requisição ainda em processamento" },
  "token-expired": { status: 410, title: "Link expirado ou já utilizado" },
  "payload-too-large": { status: 413, title: "Corpo da requisição muito grande" },
  "unsupported-media-type": { status: 415, title: "Tipo de conteúdo não suportado" },
  "invalid-image": { status: 422, title: "Arquivo de imagem inválido" },
  "idempotency-key-reused": { status: 422, title: "Chave de idempotência usada com outro corpo" },
  "sales-closed": { status: 422, title: "Vendas encerradas" },
  "rate-limited": { status: 429, title: "Muitas requisições" },
  "internal-error": { status: 500, title: "Erro interno" },
  "payments-unavailable": { status: 503, title: "Pagamentos indisponíveis no momento" },
} as const satisfies Record<string, { status: number; title: string }>;

export type ProblemType = keyof typeof PROBLEM_TYPES;

export const PROBLEM_TYPE_BASE_URI =
  "https://github.com/joaomenkdev-cloud/vira/blob/main/docs/API.md#";

export function problemTypeUri(type: ProblemType): string {
  return `${PROBLEM_TYPE_BASE_URI}${type}`;
}

/**
 * The generic type of each status, for errors that only carry a status (e.g. a plain
 * HttpException). Several types may share a status; the first one listed above is the
 * generic one, and the others are only used by throwing them explicitly.
 */
const TYPE_BY_STATUS = new Map<number, ProblemType>();
for (const [type, { status }] of Object.entries(PROBLEM_TYPES)) {
  if (!TYPE_BY_STATUS.has(status)) TYPE_BY_STATUS.set(status, type as ProblemType);
}

export function problemTypeForStatus(status: number): ProblemType | undefined {
  return TYPE_BY_STATUS.get(status);
}
