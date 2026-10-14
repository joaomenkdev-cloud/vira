import { ApiError, type ProblemCode } from "./errors";

/** "1 minuto", "5 minutos": how long to wait, rounded up to whole minutes. */
export function waitTime(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "1 minuto" : `${String(minutes)} minutos`;
}

const MESSAGES: Partial<Record<ProblemCode, string>> = {
  "network-error": "Não foi possível falar com o Vira. Confira sua conexão e tente de novo.",
  unauthenticated: "Sua sessão terminou. Entre de novo para continuar.",
  "csrf-failed": "Não foi possível confirmar esta ação. Recarregue a página e tente de novo.",
  "validation-failed": "Confira os campos destacados.",
  "token-expired": "Este link expirou ou já foi usado.",
};

/**
 * The sentence shown when a call fails for a reason the screen does not handle itself.
 * Errors explain what to do next; none of them reveals whether an e-mail has an account.
 */
export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Algo deu errado. Tente de novo em instantes.";
  }
  if (error.code === "rate-limited") {
    return error.retryAfterSeconds === undefined
      ? "Muitas tentativas seguidas. Espere alguns minutos e tente de novo."
      : `Muitas tentativas seguidas. Tente de novo em ${waitTime(error.retryAfterSeconds)}.`;
  }
  return MESSAGES[error.code] ?? "Algo deu errado do nosso lado. Tente de novo em instantes.";
}
