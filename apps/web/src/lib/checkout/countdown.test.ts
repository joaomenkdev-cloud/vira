import { describe, expect, it } from "vitest";

import { announcementFor, formatCountdown, secondsLeft } from "./countdown";

describe("the reservation countdown", () => {
  it("counts whole seconds down to zero", () => {
    const expiresAt = "2026-11-01T12:10:00.000Z";
    expect(secondsLeft(expiresAt, Date.parse("2026-11-01T12:00:19.500Z"))).toBe(581);
    expect(secondsLeft(expiresAt, Date.parse("2026-11-01T12:11:00.000Z"))).toBe(0);
    expect(formatCountdown(581)).toBe("09:41");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("speaks only at 5, 2 and 1 minutes and at the end", () => {
    expect(announcementFor(302, 301)).toBeNull();
    expect(announcementFor(301, 300)).toBe("Faltam 5 minutos para a reserva expirar.");
    expect(announcementFor(300, 299)).toBeNull();
    expect(announcementFor(121, 120)).toBe("Faltam 2 minutos para a reserva expirar.");
    expect(announcementFor(61, 60)).toBe("Falta 1 minuto para a reserva expirar.");
    expect(announcementFor(1, 0)).toBe("Sua reserva expirou.");
  });

  it("announces only the last mark a sleeping tab skipped, and nothing after an extension", () => {
    expect(announcementFor(400, 90)).toBe("Faltam 2 minutos para a reserva expirar.");
    expect(announcementFor(100, 700)).toBeNull();
  });
});
