import type { Money } from "@vira/shared";

/*
 * Dates and prices as the design asks (docs/DESIGN.md, 5): Brazilian format, dates in
 * the event's own time zone (never the visitor's or the server's), prices in reais.
 * Formatting happens on the server, so the HTML never depends on the browser's locale.
 */

const LOCALE = "pt-BR";

const priceFormat = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "BRL" });

/** "R$ 80,00". */
export function formatPrice(money: Money): string {
  return priceFormat.format(money.amountCents / 100);
}

/** "A partir de R$ 80,00", or `null` when no ticket is left (never "R$ 0,00"). */
export function formatPriceFrom(money: Money | null): string | null {
  return money ? `A partir de ${formatPrice(money)}` : null;
}

function parts(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const values = new Map(
    new Intl.DateTimeFormat(LOCALE, { timeZone, ...options })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return (type: Intl.DateTimeFormatPartTypes) => (values.get(type) ?? "").replace(".", "");
}

/** "21:00". */
export function formatTime(iso: string, timeZone: string): string {
  const part = parts(iso, timeZone, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${part("hour")}:${part("minute")}`;
}

/** The date line of a card: "SÁB, 14 MAR · 21:00" (with the year when asked). */
export function formatShortDate(iso: string, timeZone: string, withYear = false): string {
  const part = parts(iso, timeZone, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
  const date = [part("day"), part("month"), ...(withYear ? [part("year")] : [])].join(" ");
  return `${part("weekday")}, ${date} · ${formatTime(iso, timeZone)}`.toLocaleUpperCase(LOCALE);
}

/** "sábado, 14 de março". */
export function formatLongDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

const HOUR = 60 * 60 * 1000;

/**
 * When the event happens: "sábado, 14 de março · 21:00 – 02:00". An event that runs
 * past the next morning names both days: "sábado, 14 de março, 10:00 – domingo, 15 de
 * março, 18:00".
 */
export function formatDateRange(startsAt: string, endsAt: string, timeZone: string): string {
  const sameNight = Date.parse(endsAt) - Date.parse(startsAt) < 24 * HOUR;
  const endDay = formatLongDay(endsAt, timeZone);
  const startDay = formatLongDay(startsAt, timeZone);
  if (sameNight || endDay === startDay) {
    return `${startDay} · ${formatTime(startsAt, timeZone)} – ${formatTime(endsAt, timeZone)}`;
  }
  return `${startDay}, ${formatTime(startsAt, timeZone)} – ${endDay}, ${formatTime(endsAt, timeZone)}`;
}

/** "Horário de Brasília (GMT−3)": the zone the times above are in. */
export function formatTimeZone(iso: string, timeZone: string): string {
  const name = (style: "longGeneric" | "shortOffset") =>
    new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName: style })
      .formatToParts(new Date(iso))
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  const offset = name("shortOffset").replace("-", "−");
  return `${name("longGeneric")} (${offset})`;
}

/** "Casa de Shows · Recife". */
export function formatVenue(venue: { name: string; city: string }): string {
  return `${venue.name} · ${venue.city}`;
}

/** "10/03 às 12:00": when the sales of a ticket type open. */
export function formatDayAndTime(iso: string, timeZone: string): string {
  const part = parts(iso, timeZone, { day: "2-digit", month: "2-digit" });
  return `${part("day")}/${part("month")} às ${formatTime(iso, timeZone)}`;
}

/** The text of sanitized HTML, as one line, cut at a word for a meta description. */
export function summarize(html: string, maxLength = 160): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}
