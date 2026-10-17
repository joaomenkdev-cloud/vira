import type { Event } from "../domain/event.js";
import { InvalidEventInputError } from "./errors.js";

/** Far more than any event needs; keeps one event from growing without bound. */
export const MAX_TICKET_TYPES_PER_EVENT = 20;

/**
 * The sales window of a ticket type, once merged with what it had: ordered, and closed
 * by the end of the event at the latest (nobody buys for an event that is over).
 */
export function checkSalesWindow(
  event: Pick<Event, "endsAt">,
  window: { readonly salesStartAt: Date | null; readonly salesEndAt: Date | null },
): void {
  const { salesStartAt, salesEndAt } = window;
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new InvalidEventInputError("salesEndAt", "o fim das vendas deve ser depois do início");
  }
  if (salesEndAt && salesEndAt > event.endsAt) {
    throw new InvalidEventInputError(
      "salesEndAt",
      "as vendas precisam terminar até o fim do evento",
    );
  }
  if (salesStartAt && salesStartAt >= event.endsAt) {
    throw new InvalidEventInputError(
      "salesStartAt",
      "as vendas precisam começar antes do fim do evento",
    );
  }
}
