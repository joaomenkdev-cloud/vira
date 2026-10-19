import { describe, expect, it } from "vitest";

import {
  formatDateRange,
  formatDayAndTime,
  formatLongDay,
  formatPrice,
  formatPriceFrom,
  formatShortDate,
  formatTime,
  formatTimeZone,
  formatVenue,
  summarize,
} from "./format";

const SP = "America/Sao_Paulo";
// Saturday, 14 March 2026, 21:00 in São Paulo.
const SATURDAY_NIGHT = "2026-03-15T00:00:00.000Z";

describe("prices", () => {
  it("are in reais, Brazilian style", () => {
    expect(formatPrice({ amountCents: 8000, currency: "BRL" })).toBe("R$ 80,00");
    expect(formatPrice({ amountCents: 123456, currency: "BRL" })).toBe("R$ 1.234,56");
  });

  it("start from the lowest, and disappear when nothing is left", () => {
    expect(formatPriceFrom({ amountCents: 8000, currency: "BRL" })).toBe("A partir de R$ 80,00");
    expect(formatPriceFrom(null)).toBeNull();
  });
});

describe("dates", () => {
  it("are told in the event's time zone, not the server's", () => {
    expect(formatTime(SATURDAY_NIGHT, SP)).toBe("21:00");
    expect(formatTime(SATURDAY_NIGHT, "America/Manaus")).toBe("20:00");
    expect(formatTime(SATURDAY_NIGHT, "America/Noronha")).toBe("22:00");
  });

  it("fit the card line: weekday, day, month and time in capitals", () => {
    expect(formatShortDate(SATURDAY_NIGHT, SP)).toBe("SÁB, 14 MAR · 21:00");
    expect(formatShortDate(SATURDAY_NIGHT, SP, true)).toBe("SÁB, 14 MAR 2026 · 21:00");
  });

  it("are written out on the event page", () => {
    expect(formatLongDay(SATURDAY_NIGHT, SP)).toBe("sábado, 14 de março");
  });

  it("give a time range for a night, and both days for a longer event", () => {
    expect(formatDateRange(SATURDAY_NIGHT, "2026-03-15T05:00:00.000Z", SP)).toBe(
      "sábado, 14 de março · 21:00 – 02:00",
    );
    expect(formatDateRange("2026-03-14T13:00:00.000Z", "2026-03-15T21:00:00.000Z", SP)).toBe(
      "sábado, 14 de março, 10:00 – domingo, 15 de março, 18:00",
    );
  });

  it("name the time zone and its offset", () => {
    expect(formatTimeZone(SATURDAY_NIGHT, SP)).toBe("Horário Padrão de Brasília (GMT−3)");
  });
});

describe("venues", () => {
  it("join the place and the city", () => {
    expect(formatVenue({ name: "Casa de Shows", city: "Recife" })).toBe("Casa de Shows · Recife");
  });
});

describe("sales opening", () => {
  it("is day, month and time in the event's zone", () => {
    expect(formatDayAndTime("2026-03-10T15:00:00.000Z", SP)).toBe("10/03 às 12:00");
  });
});

describe("summarize", () => {
  it("turns sanitized HTML into one line of text", () => {
    expect(summarize("<p>Forró &amp; xote</p>\n<ul><li>Banda</li></ul>")).toBe(
      "Forró & xote Banda",
    );
  });

  it("cuts long text at a word, with an ellipsis", () => {
    const text = `<p>${"palavra ".repeat(40)}</p>`;
    const summary = summarize(text, 50);
    expect(summary.length).toBeLessThanOrEqual(50);
    expect(summary).toMatch(/palavra…$/);
  });
});
