import {
  CANCEL_REASON_MAX_LENGTH,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_IMAGE_ALT_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  EVENT_TITLE_MIN_LENGTH,
  MAX_PER_ORDER_LIMIT,
  TICKET_CAPACITY_MAX,
  TICKET_PRICE_MAX_CENTS,
  TICKET_PRICE_MIN_CENTS,
  TICKET_TYPE_DESCRIPTION_MAX_LENGTH,
  TICKET_TYPE_NAME_MAX_LENGTH,
} from "@vira/shared";

import type { Validator } from "@/components/forms/validation";

import { formatCents, parsePriceToCents } from "./money";
import { wallTimeToIso } from "./wall-time";

/*
 * The checks of the panel's forms, mirroring the event contracts of `@vira/shared`
 * (N8). The API checks everything again; these only spare a round trip and say how to
 * fix the field.
 */

const tooLong = (max: number) => `Use até ${max.toLocaleString("pt-BR")} caracteres.`;

function within(value: string, min: number, max: number, empty: string) {
  const length = value.trim().length;
  if (length === 0) return empty;
  if (length < min) return `Use pelo menos ${String(min)} caracteres.`;
  if (length > max) return tooLong(max);
  return undefined;
}

export const validateTitle: Validator = (value) =>
  within(value, EVENT_TITLE_MIN_LENGTH, EVENT_TITLE_MAX_LENGTH, "Dê um nome ao evento.");

export const validateDescription: Validator = (value) =>
  value.length > EVENT_DESCRIPTION_MAX_LENGTH ? tooLong(EVENT_DESCRIPTION_MAX_LENGTH) : undefined;

const DATE_FORMAT = "Informe a data e o horário, como 05/12/2026 22:00.";

export const validateStartsAt: Validator = (value) => {
  if (value === "") return "Informe quando o evento começa.";
  return wallTimeToIso(value, "UTC") === null ? DATE_FORMAT : undefined;
};

/** After the start, both read on the event's clock (`timezone`). */
export const validateEndsAt: Validator = (value, values = {}) => {
  if (value === "") return "Informe quando o evento termina.";
  if (wallTimeToIso(value, "UTC") === null) return DATE_FORMAT;
  const start = values["startsAt"] ?? "";
  if (wallTimeToIso(start, "UTC") !== null && value <= start) {
    return "O fim precisa ser depois do início.";
  }
  return undefined;
};

/** The venue fields, in order: all filled, or all empty (a draft may have no venue yet). */
export const VENUE_FIELDS = ["venueName", "venueAddress", "venueCity", "venueState"] as const;

const hasVenue = (values: Readonly<Record<string, string>>) =>
  VENUE_FIELDS.some((field) => (values[field] ?? "").trim() !== "");

function venueField(max: number, missing: string): Validator {
  return (value, values = {}) => {
    if (value.trim() === "") return hasVenue(values) ? missing : undefined;
    return value.trim().length > max ? tooLong(max) : undefined;
  };
}

export const validateVenueName = venueField(120, "Informe o nome do local.");
export const validateVenueAddress = venueField(200, "Informe o endereço.");
export const validateVenueCity = venueField(80, "Informe a cidade.");
export const validateVenueState: Validator = (value, values = {}) =>
  value === "" && hasVenue(values) ? "Escolha a UF." : undefined;

export const validateTicketName: Validator = (value) =>
  within(value, 1, TICKET_TYPE_NAME_MAX_LENGTH, "Dê um nome ao tipo de ingresso.");

export const validateTicketDescription: Validator = (value) =>
  value.trim().length > TICKET_TYPE_DESCRIPTION_MAX_LENGTH
    ? tooLong(TICKET_TYPE_DESCRIPTION_MAX_LENGTH)
    : undefined;

export const validatePrice: Validator = (value) => {
  if (value.trim() === "") return "Informe o preço.";
  const cents = parsePriceToCents(value);
  if (cents === null) return "Informe o preço em reais, como 80,00.";
  if (cents < TICKET_PRICE_MIN_CENTS || cents > TICKET_PRICE_MAX_CENTS) {
    return `O preço vai de R$ ${formatCents(TICKET_PRICE_MIN_CENTS)} a R$ ${formatCents(TICKET_PRICE_MAX_CENTS)}.`;
  }
  return undefined;
};

/** A whole number from `min` to `max`, as typed (no thousands separator). */
export function parseWholeNumber(value: string, min: number, max: number): number | null {
  if (!/^\d{1,7}$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return number >= min && number <= max ? number : null;
}

export const validateCapacity: Validator = (value) => {
  if (value.trim() === "") return "Informe quantos ingressos há deste tipo.";
  return parseWholeNumber(value, 1, TICKET_CAPACITY_MAX) === null
    ? `Use um número inteiro de 1 a ${TICKET_CAPACITY_MAX.toLocaleString("pt-BR")}.`
    : undefined;
};

export const validateMaxPerOrder: Validator = (value) => {
  if (value.trim() === "") return "Informe quantos ingressos cabem num pedido.";
  return parseWholeNumber(value, 1, MAX_PER_ORDER_LIMIT) === null
    ? `Use um número inteiro de 1 a ${String(MAX_PER_ORDER_LIMIT)}.`
    : undefined;
};

/** Optional; when both are there, the sales end after they start and by the event's end. */
export function salesWindowValidators(eventEndsAtWall: string): {
  salesStartAt: Validator;
  salesEndAt: Validator;
} {
  return {
    salesStartAt: (value) => {
      if (value === "") return undefined;
      if (wallTimeToIso(value, "UTC") === null) return DATE_FORMAT;
      return value >= eventEndsAtWall
        ? "As vendas precisam abrir antes do fim do evento."
        : undefined;
    },
    salesEndAt: (value, values = {}) => {
      if (value === "") return undefined;
      if (wallTimeToIso(value, "UTC") === null) return DATE_FORMAT;
      const start = values["salesStartAt"] ?? "";
      if (start !== "" && value <= start) return "O fim das vendas precisa ser depois do início.";
      return value > eventEndsAtWall
        ? "As vendas precisam terminar até o fim do evento."
        : undefined;
    },
  };
}

export const validateCancelReason: Validator = (value) =>
  within(
    value,
    3,
    CANCEL_REASON_MAX_LENGTH,
    "Conte a quem comprou por que o evento foi cancelado.",
  );

export const validateImageAlt: Validator = (value) =>
  within(value, 3, EVENT_IMAGE_ALT_MAX_LENGTH, "Descreva a imagem para quem não pode vê-la.");
