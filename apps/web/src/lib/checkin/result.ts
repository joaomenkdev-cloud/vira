import { CircleCheck, CircleX, History, type LucideIcon } from "lucide-react";
import type { CheckinResponseBody } from "@vira/shared";

import { formatTime } from "../format";

export interface Look {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly detail: string;
  readonly className: string;
}

/**
 * How a result looks: colour, icon and words together, never colour alone
 * (docs/DESIGN.md, "Resultado de check-in"). A canceled ticket comes as `INVALID` with
 * the ticket it is.
 */
export function lookOf(outcome: CheckinResponseBody, timezone: string): Look {
  switch (outcome.result) {
    case "VALID":
      return {
        icon: CircleCheck,
        title: "Válido",
        detail: "Entrada liberada.",
        className: "bg-success-bg text-success",
      };
    case "ALREADY_USED":
      return {
        icon: History,
        title: outcome.usedAt
          ? `Já utilizado às ${formatTime(outcome.usedAt, timezone)}`
          : "Já utilizado",
        detail: "Este ingresso já entrou. Não libere a entrada.",
        className: "bg-warning-bg text-warning",
      };
    case "WRONG_EVENT":
      return {
        icon: CircleX,
        title: "Outro evento",
        detail: "Este ingresso não é deste evento. Não libere a entrada.",
        className: "bg-danger-bg text-danger",
      };
    case "INVALID":
      return outcome.ticket
        ? {
            icon: CircleX,
            title: "Cancelado",
            detail: "Este ingresso foi cancelado. Não libere a entrada.",
            className: "bg-danger-bg text-danger",
          }
        : {
            icon: CircleX,
            title: "Inválido",
            detail: "QR Code ou código não reconhecido. Não libere a entrada.",
            className: "bg-danger-bg text-danger",
          };
  }
}

/** Short vibrations a pocket can tell apart: one for yes, three for no. */
export function vibrationOf(outcome: CheckinResponseBody): number[] {
  return outcome.result === "VALID" ? [120] : [80, 60, 80, 60, 80];
}
