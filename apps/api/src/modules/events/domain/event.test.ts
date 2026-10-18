import { describe, expect, it } from "vitest";

import { editRefusal, type Event, missingForPublication } from "./event.js";
import { eventSlug } from "./event-slug.js";

const now = new Date("2026-10-17T12:00:00Z");

const picture = {
  key: "events/x/y.webp",
  alt: "Pista cheia sob a lona",
  width: 2400,
  height: 1350,
  blurDataUrl: "data:image/webp;base64,AA==",
};

const complete: Event = {
  id: "0192a0e4-0000-7000-8000-0000000000e1",
  organizerId: "0192a0e4-0000-7000-8000-0000000000b1",
  slug: "noite-de-forro-abc123",
  title: "Noite de forró",
  descriptionMd: "",
  descriptionHtml: "",
  status: "DRAFT",
  startsAt: new Date("2026-12-05T22:00:00Z"),
  endsAt: new Date("2026-12-06T03:00:00Z"),
  timezone: "America/Sao_Paulo",
  venue: {
    name: "Circo Voador",
    address: "Rua dos Arcos, s/n",
    city: "Rio de Janeiro",
    state: "RJ",
  },
  image: picture,
  isDemo: false,
  publishedAt: null,
  canceledAt: null,
  cancelReason: null,
  createdAt: now,
  updatedAt: now,
  ticketTypes: [
    {
      id: "0192a0e4-0000-7000-8000-0000000000t1",
      eventId: "0192a0e4-0000-7000-8000-0000000000e1",
      name: "Pista",
      description: null,
      priceCents: 8000,
      capacity: 100,
      sold: 0,
      reserved: 0,
      maxPerOrder: 10,
      salesStartAt: null,
      salesEndAt: null,
      sortOrder: 0,
      createdAt: now,
    },
  ],
};

describe("missingForPublication", () => {
  it("is empty for a complete event", () => {
    expect(missingForPublication(complete, now)).toEqual([]);
  });

  it("lists everything an empty draft lacks, by the field to fill", () => {
    const draft: Event = {
      ...complete,
      startsAt: new Date("2026-10-01T22:00:00Z"),
      venue: null,
      image: null,
      ticketTypes: [],
    };
    expect(missingForPublication(draft, now).map((m) => m.path)).toEqual([
      "startsAt",
      "venue",
      "image",
      "ticketTypes",
    ]);
  });

  it("asks for the text alternative of an image that has none", () => {
    const noAlt = { ...complete, image: { ...picture, alt: null } };
    expect(missingForPublication(noAlt, now).map((m) => m.path)).toEqual(["image.alt"]);
  });

  it("treats an event starting right now as not in the future", () => {
    expect(missingForPublication({ ...complete, startsAt: now }, now)[0]?.path).toBe("startsAt");
  });
});

describe("editRefusal", () => {
  it("allows drafts and published events that have not ended", () => {
    expect(editRefusal(complete, now)).toBeNull();
    expect(editRefusal({ ...complete, status: "PUBLISHED" }, now)).toBeNull();
  });

  it("refuses canceled and ended events", () => {
    expect(editRefusal({ ...complete, status: "CANCELED" }, now)).toMatch(/cancelado/);
    expect(editRefusal({ ...complete, endsAt: now }, now)).toMatch(/terminou/);
  });
});

describe("eventSlug", () => {
  it("joins the title's slug and the suffix", () => {
    expect(eventSlug("Noite de Forró no Circo!", "k3x9q2")).toBe("noite-de-forro-no-circo-k3x9q2");
  });

  it("falls back when nothing of the title survives", () => {
    expect(eventSlug("🎉🎉🎉", "k3x9q2")).toBe("evento-k3x9q2");
  });

  it("stays within the 80 characters the database allows", () => {
    const slug = eventSlug("a".repeat(120), "k3x9q2");
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
