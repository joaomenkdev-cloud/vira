import { describe, expect, it } from "vitest";

import { anonymizedEmail, anonymizedSlug, retentionCutoffs } from "./anonymization.js";

describe("anonymization", () => {
  it("gives each removed account an address that cannot receive mail", () => {
    const email = anonymizedEmail("0192a7c0-0000-7000-8000-000000000001");
    expect(email).toBe("deleted+0192a7c0-0000-7000-8000-000000000001@invalid");
    // The users table checks this shape (lower case, one @, no spaces).
    expect(email).toMatch(/^[^@\s]+@[^@\s]+$/);
    expect(email).toBe(email.toLowerCase());
  });

  it("makes a slug that no longer comes from the name, in the slug format", () => {
    expect(anonymizedSlug("0192a7c0-0000-7000-8000-000000000001")).toMatch(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
    );
  });

  it("counts each retention period back from now", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const cutoffs = retentionCutoffs(now);
    expect(cutoffs.eventsEndedBefore.toISOString()).toBe("2026-07-24T12:00:00.000Z");
    expect(cutoffs.sessionsExpiredBefore.toISOString()).toBe("2026-09-22T12:00:00.000Z");
    expect(cutoffs.tokensExpiredBefore).toEqual(now);
    expect(cutoffs.ordersCreatedBefore.toISOString()).toBe("2021-10-23T12:00:00.000Z");
    expect(cutoffs.webhookEventsBefore.toISOString()).toBe("2026-07-24T12:00:00.000Z");
  });
});
