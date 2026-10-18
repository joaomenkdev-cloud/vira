import { ProblemException } from "../../../platform/errors/problem.exception.js";
import {
  EventNotFoundError,
  InvalidEventInputError,
  InvalidTransitionError,
  InventoryConflictError,
  NotOrganizerError,
  TicketTypeNotFoundError,
} from "../application/errors.js";

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
    if (error instanceof InvalidEventInputError) {
      throw new ProblemException("validation-failed", {
        errors: [{ path: error.path, message: error.detail }],
      });
    }
    throw error;
  }
}
