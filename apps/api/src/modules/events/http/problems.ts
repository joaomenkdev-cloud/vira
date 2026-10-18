import { EVENT_IMAGE_MIN_HEIGHT, EVENT_IMAGE_MIN_WIDTH } from "@vira/shared";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import {
  rateLimitHeaders,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import {
  EventNotFoundError,
  InvalidEventInputError,
  InvalidTransitionError,
  InventoryConflictError,
  NotOrganizerError,
  TicketTypeNotFoundError,
  UnusableUploadError,
  UploadNotFoundError,
  type UploadProblem,
} from "../application/errors.js";

/** What the organizer reads when a file is refused. */
const UPLOAD_PROBLEMS: Record<UploadProblem, string> = {
  "not-received": "O arquivo ainda não chegou. Envie-o pela URL recebida e confirme de novo.",
  "size-mismatch": "O arquivo enviado não tem o tamanho informado.",
  "not-an-image": "O arquivo não é uma imagem JPEG, PNG ou WebP.",
  "type-mismatch": "O conteúdo do arquivo não confere com o tipo informado.",
  "too-small": `A imagem precisa ter ao menos ${EVENT_IMAGE_MIN_WIDTH} × ${EVENT_IMAGE_MIN_HEIGHT} pixels.`,
  "too-large": "A imagem tem pixels demais para ser processada.",
  unreadable: "Não foi possível ler a imagem; o arquivo pode estar corrompido.",
};

/** Runs a use case and turns its expected failures into documented problems. */
export async function asProblem<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotOrganizerError) {
      throw new ProblemException("forbidden", {
        detail: "Crie seu perfil de organizador para gerenciar eventos.",
      });
    }
    if (error instanceof EventNotFoundError || error instanceof TicketTypeNotFoundError) {
      throw new ProblemException("not-found");
    }
    if (error instanceof InvalidTransitionError) {
      throw new ProblemException("invalid-state-transition", {
        detail: error.detail,
        ...(error.missing.length > 0 ? { errors: [...error.missing] } : {}),
      });
    }
    if (error instanceof InventoryConflictError) {
      throw new ProblemException("conflict", { detail: error.detail });
    }
    if (error instanceof UploadNotFoundError) {
      throw new ProblemException("not-found", {
        detail: "Envio não encontrado, já usado ou expirado. Peça uma nova URL.",
      });
    }
    if (error instanceof UnusableUploadError) {
      throw new ProblemException("invalid-image", { detail: UPLOAD_PROBLEMS[error.problem] });
    }
    if (error instanceof RateLimitExceededError) {
      throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
    }
    if (error instanceof InvalidEventInputError) {
      throw new ProblemException("validation-failed", {
        errors: [{ path: error.path, message: error.detail }],
      });
    }
    throw error;
  }
}
