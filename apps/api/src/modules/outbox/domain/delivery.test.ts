import { describe, expect, it } from "vitest";

import { isParked, recordAttempt } from "./delivery.js";
import { MAX_DISPATCH_ATTEMPTS } from "./retry-policy.js";

const now = new Date("2026-10-08T12:00:00Z");

describe("recordAttempt", () => {
  it("marks the message delivered on success", () => {
    expect(recordAttempt(0, {}, now)).toEqual({
      attempts: 1,
      dispatchedAt: now,
      availableAt: now,
      lastError: null,
    });
  });

  it("clears a previous error once a retry succeeds", () => {
    expect(recordAttempt(3, {}, now)).toMatchObject({ attempts: 4, lastError: null });
  });

  it("schedules a retry with backoff on failure", () => {
    expect(recordAttempt(0, { error: "Error: redis down" }, now)).toEqual({
      attempts: 1,
      dispatchedAt: null,
      availableAt: new Date("2026-10-08T12:00:05Z"),
      lastError: "Error: redis down",
    });
    expect(recordAttempt(1, { error: "Error: redis down" }, now).availableAt).toEqual(
      new Date("2026-10-08T12:00:10Z"),
    );
  });
});

describe("isParked", () => {
  it("parks a message once it used all its attempts", () => {
    expect(isParked(MAX_DISPATCH_ATTEMPTS - 1)).toBe(false);
    expect(isParked(MAX_DISPATCH_ATTEMPTS)).toBe(true);
  });
});
