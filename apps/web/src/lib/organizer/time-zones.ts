/**
 * The time zones of Brazil an event can be in, by the name people know them by. An
 * event created elsewhere (by the API, the seed) may be in another IANA zone: the form
 * then offers that one too, by its name.
 */
export const BRAZILIAN_TIME_ZONES: readonly { value: string; label: string }[] = [
  { value: "America/Sao_Paulo", label: "Horário de Brasília" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
  { value: "America/Manaus", label: "Amazonas, Roraima e parte do Pará" },
  { value: "America/Cuiaba", label: "Mato Grosso e Mato Grosso do Sul" },
  { value: "America/Porto_Velho", label: "Rondônia" },
  { value: "America/Rio_Branco", label: "Acre" },
];

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

/** The options of the time zone field, with the event's own zone if it is not listed. */
export function timeZoneOptions(current?: string): { value: string; label: string }[] {
  const options = [...BRAZILIAN_TIME_ZONES];
  if (current !== undefined && !options.some((option) => option.value === current)) {
    options.push({ value: current, label: current.replaceAll("_", " ") });
  }
  return options;
}
