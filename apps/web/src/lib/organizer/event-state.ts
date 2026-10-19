import type { BadgeVariant } from "@vira/ui";
import type { OrganizerEvent, OrganizerEventSummary } from "@vira/shared";

/*
 * What the panel says about an event's state. "Encerrado" is not a status of the API:
 * it is a published event whose end has passed (docs/API.md, N8), which can no longer
 * change.
 */

export type EventPhase = "DRAFT" | "PUBLISHED" | "ENDED" | "CANCELED";

export function phaseOf(
  event: Pick<OrganizerEventSummary, "status" | "endsAt">,
  now = Date.now(),
): EventPhase {
  if (event.status === "CANCELED") return "CANCELED";
  if (event.status === "PUBLISHED" && Date.parse(event.endsAt) <= now) return "ENDED";
  return event.status;
}

export const PHASE_BADGES: Readonly<Record<EventPhase, { label: string; variant: BadgeVariant }>> =
  {
    DRAFT: { label: "Rascunho", variant: "neutral" },
    PUBLISHED: { label: "Publicado", variant: "success" },
    ENDED: { label: "Encerrado", variant: "neutral" },
    CANCELED: { label: "Cancelado", variant: "danger" },
  };

/**
 * Why the event can no longer change, or `null` when it can (mirrors `editRefusal` of
 * the API; a draft whose dates have passed can still be fixed).
 */
export function lockedReason(event: Pick<OrganizerEvent, "status" | "endsAt">, now = Date.now()) {
  const phase = phaseOf(event, now);
  if (phase === "CANCELED") return "Este evento foi cancelado e não pode mais ser alterado.";
  if (phase === "ENDED") return "Este evento já terminou e não pode mais ser alterado.";
  return null;
}

export interface PublicationStep {
  /** The field of the API's `errors` (`invalid-state-transition`) this step answers. */
  path: "startsAt" | "venue" | "image" | "ticketTypes";
  label: string;
  done: boolean;
  /** Where on the page the organizer fixes it. */
  anchor: string;
}

/**
 * What publishing asks for, in the order of the page (mirrors `missingForPublication`
 * of the API, which has the last word: a refusal lists what it found missing).
 */
export function publicationSteps(event: OrganizerEvent, now = Date.now()): PublicationStep[] {
  return [
    {
      path: "startsAt",
      label: "Data de início no futuro",
      done: Date.parse(event.startsAt) > now,
      anchor: "detalhes",
    },
    { path: "venue", label: "Local do evento", done: event.venue !== null, anchor: "detalhes" },
    {
      path: "image",
      label: "Imagem com descrição",
      done: event.image !== null && event.image.alt !== "",
      anchor: "imagem",
    },
    {
      path: "ticketTypes",
      label: "Ao menos um tipo de ingresso",
      done: event.ticketTypes.length > 0,
      anchor: "ingressos",
    },
  ];
}
