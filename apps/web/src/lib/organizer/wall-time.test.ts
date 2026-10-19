import { describe, expect, it } from "vitest";

import { isoToWallTime, wallTimeToIso } from "./wall-time";

describe("wallTimeToIso", () => {
  it("reads the clock of the event's zone, not the browser's", () => {
    expect(wallTimeToIso("2026-12-05T22:00", "America/Sao_Paulo")).toBe("2026-12-06T01:00:00.000Z");
    expect(wallTimeToIso("2026-12-05T22:00", "America/Manaus")).toBe("2026-12-06T02:00:00.000Z");
    expect(wallTimeToIso("2026-12-05T22:00", "America/Noronha")).toBe("2026-12-06T00:00:00.000Z");
    expect(wallTimeToIso("2026-12-05T22:00", "UTC")).toBe("2026-12-05T22:00:00.000Z");
  });

  it("follows daylight saving time in zones that still have it", () => {
    expect(wallTimeToIso("2026-07-01T12:00", "Europe/Lisbon")).toBe("2026-07-01T11:00:00.000Z");
    expect(wallTimeToIso("2026-01-15T12:00", "Europe/Lisbon")).toBe("2026-01-15T12:00:00.000Z");
  });

  it("moves a time the clocks skip forward, as the clocks do", () => {
    // Lisbon jumps from 01:00 to 02:00 on 29 March 2026.
    expect(wallTimeToIso("2026-03-29T01:30", "Europe/Lisbon")).toBe("2026-03-29T01:30:00.000Z");
  });

  it("refuses text that is not a whole date and time", () => {
    for (const text of [
      "",
      "2026-12-05",
      "2026-12-05T22",
      "05/12/2026 22:00",
      "2026-02-30T10:00",
    ]) {
      expect(wallTimeToIso(text, "America/Sao_Paulo")).toBeNull();
    }
  });
});

describe("isoToWallTime", () => {
  it("shows an instant on the zone's clock, for a datetime-local field", () => {
    expect(isoToWallTime("2026-12-06T01:00:00Z", "America/Sao_Paulo")).toBe("2026-12-05T22:00");
    expect(isoToWallTime("2026-12-06T01:00:00.000Z", "America/Rio_Branco")).toBe(
      "2026-12-05T20:00",
    );
  });

  it("is the inverse of wallTimeToIso", () => {
    for (const zone of ["America/Sao_Paulo", "America/Cuiaba", "Europe/Lisbon", "Asia/Kolkata"]) {
      const iso = wallTimeToIso("2026-10-24T19:45", zone);
      expect(iso && isoToWallTime(iso, zone)).toBe("2026-10-24T19:45");
    }
  });
});
