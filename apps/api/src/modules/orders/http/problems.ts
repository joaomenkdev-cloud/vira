import { ProblemException } from "../../../platform/errors/problem.exception.js";
import {
  rateLimitHeaders,
  RateLimitExceededError,
} from "../../../platform/rate-limit/rate-limiter.js";
import {
  PaymentGatewayError,
  PaymentsUnavailableError,
} from "../../payments/application/public-api.js";
import {
  BuyerNotFoundError,
  EventNotFoundError,
  IdempotencyKeyReusedError,
  InsufficientInventoryError,
  InvalidOrderError,
  OrderNotFoundError,
  OrderStateError,
  PendingOrderExistsError,
  RequestInProgressError,
  SalesClosedError,
  TicketTypeNotFoundError,
} from "../application/errors.js";

/** Runs a use case and turns its expected failures into documented problems. */
export async function asProblem<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof EventNotFoundError ||
      error instanceof TicketTypeNotFoundError ||
      error instanceof OrderNotFoundError
    ) {
      throw new ProblemException("not-found");
    }
    if (error instanceof BuyerNotFoundError) throw new ProblemException("unauthenticated");
    if (error instanceof SalesClosedError) {
      throw new ProblemException("sales-closed", { detail: error.detail });
    }
    if (error instanceof OrderStateError) {
      throw new ProblemException("invalid-state-transition", { detail: error.detail });
    }
    if (error instanceof InsufficientInventoryError) {
      throw new ProblemException("insufficient-inventory", {
        detail:
          error.available === 0
            ? `Os ingressos de "${error.ticketTypeName}" esgotaram.`
            : `Restam ${error.available} ingresso(s) de "${error.ticketTypeName}".`,
      });
    }
    if (error instanceof PendingOrderExistsError) {
      throw new ProblemException("pending-order-exists", {
        detail: "Você já tem uma reserva em andamento para este evento.",
      });
    }
    if (error instanceof RequestInProgressError) {
      throw new ProblemException("request-in-progress");
    }
    if (error instanceof IdempotencyKeyReusedError) {
      throw new ProblemException("idempotency-key-reused", {
        detail: "Esta Idempotency-Key já foi usada em outro pedido. Gere uma nova.",
      });
    }
    if (error instanceof InvalidOrderError) {
      throw new ProblemException("validation-failed", {
        errors: [{ path: error.path, message: error.detail }],
      });
    }
    if (error instanceof PaymentsUnavailableError || error instanceof PaymentGatewayError) {
      throw new ProblemException("payments-unavailable", {
        detail: "Não foi possível iniciar o pagamento agora. Tente de novo em instantes.",
      });
    }
    if (error instanceof RateLimitExceededError) {
      throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
    }
    throw error;
  }
}
