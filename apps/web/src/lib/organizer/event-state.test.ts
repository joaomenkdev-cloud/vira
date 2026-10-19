import type { OrganizerEvent } from "@vira/shared";
import { describe, expect, it } from "vitest";

import { lockedReason, phaseOf, publicationSteps } from "./event-state";

const now = Date.parse("2026-10-19T12:00:00Z");

const draft: OrganizerEvent = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "noite-de-forro-abc123",
  title: "Noite de forró",
  status: "DRAFT",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00Z",
  timezone: "America/Sao_Paulo",
  venue: null,
  isDemo: false,
  descriptionMd: "",
  descriptionHtml: "",
  image: null,
  publishedAt: null,
  canceledAt: null,
  cancelReason: null,
  ticketTypes: [],
  createdAt: "2026-10-19T10:00:00Z",
  updatedAt: "2026-10-19T10:00:00Z",
};

describe("phaseOf", () => {
  it("calls a published event whose end has passed 'ended'", () => {
    expect(phaseOf(draft, now)).toBe("DRAFT");
    expect(phaseOf({ ...draft, status: "PUBLISHED" }, now)).toBe("PUBLISHED");
    expect(phaseOf({ ...draft, status: "PUBLISHED", endsAt: "2026-10-01T00:00:00Z" }, now)).toBe(
      "ENDED",
    );
    expect(phaseOf({ ...draft, status: "CANCELED" }, now)).toBe("CANCELED");
  });
});

describe("lockedReason", () => {
  it("locks canceled and ended events only", () => {
    expect(lockedReason(draft, now)).toBeNull();
    expect(lockedReason({ ...draft, status: "PUBLISHED" }, now)).toBeNull();
    expect(lockedReason({ ...draft, status: "CANCELED" }, now)).toMatch(/cancelado/);
    expect(
      lockedReason({ ...draft, status: "PUBLISHED", endsAt: "2026-10-01T00:00:00Z" }, now),
    ).toMatch(/terminou/);
  });

  it("lets a draft whose dates have passed be fixed", () => {
    expect(lockedReason({ ...draft, endsAt: "2026-10-01T00:00:00Z" }, now)).toBeNull();
  });
});

describe("publicationSteps", () => {
  it("lists what an empty draft lacks, in the order of the page", () => {
    expect(publicationSteps(draft, now).map((step) => [step.path, step.done])).toEqual([
      ["startsAt", true],
      ["venue", false],
      ["image", false],
      ["ticketTypes", false],
    ]);
  });

  it("asks for a start in the future and an image with its description", () => {
    const steps = publicationSteps(
      {
        ...draft,
        startsAt: "2026-10-19T12:00:00Z",
        image: {
          url: "https://x.test/a.webp",
          alt: "",
          width: 2400,
          height: 1350,
          blurDataUrl: "",
        },
      },
      now,
    );
    expect(steps.find((step) => step.path === "startsAt")?.done).toBe(false);
    expect(steps.find((step) => step.path === "image")?.done).toBe(false);
  });
});
