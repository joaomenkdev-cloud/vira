import type { CreateEventRequest } from "@vira/shared";
import { describe, expect, it } from "vitest";

import type {
  TransactionContext,
  TransactionRunner,
} from "../../../platform/database/transaction.js";
import { AuditLog } from "../../audit/application/public-api.js";
import type { OrganizerProfiles } from "../../users/application/public-api.js";
import { CancelEvent } from "./cancel-event.js";
import { CreateEvent } from "./create-event.js";
import { CreateTicketType } from "./create-ticket-type.js";
import { DeleteDraftEvent } from "./delete-draft-event.js";
import { DeleteTicketType } from "./delete-ticket-type.js";
import {
  EventNotFoundError,
  InvalidEventInputError,
  InvalidTransitionError,
  InventoryConflictError,
  NotOrganizerError,
  TicketTypeNotFoundError,
} from "./errors.js";
import { GetOrganizerEvent } from "./get-organizer-event.js";
import { InMemoryEvents } from "./in-memory-events.fakes.js";
import { ListOrganizerEvents } from "./list-organizer-events.js";
import { type Caller, OrganizerScope } from "./organizer-scope.js";
import { PublishEvent } from "./publish-event.js";
import { UpdateEvent } from "./update-event.js";
import { UpdateTicketType } from "./update-ticket-type.js";

const ana: Caller = { id: "0192a0e4-0000-7000-8000-00000000a0a0", role: "ORGANIZER" };
const bia: Caller = { id: "0192a0e4-0000-7000-8000-00000000b0b0", role: "ORGANIZER" };
const semPerfil: Caller = { id: "0192a0e4-0000-7000-8000-00000000c0c0", role: "ADMIN" };

const draft: CreateEventRequest = {
  title: "Noite de forró no Circo",
  descriptionMd: "**Traga** documento.",
  startsAt: "2026-12-05T22:00:00Z",
  endsAt: "2026-12-06T03:00:00Z",
  timezone: "America/Sao_Paulo",
  venue: {
    name: "Circo Voador",
    address: "Rua dos Arcos, s/n",
    city: "Rio de Janeiro",
    state: "RJ",
  },
};
const ticket = { name: "Pista", priceCents: 8000, capacity: 100, maxPerOrder: 10 };

function setup() {
  const clock = { current: new Date("2026-10-17T12:00:00Z"), now: () => clock.current };
  let n = 0;
  const ids = { next: () => `0192a0e4-0000-7000-8000-${String(++n).padStart(12, "0")}` };
  const events = new InMemoryEvents();
  const profiles = new Map([
    [ana.id, "0192a0e4-0000-7000-8000-0000000000a1"],
    [bia.id, "0192a0e4-0000-7000-8000-0000000000b1"],
  ]);
  const scope = new OrganizerScope({
    profileIdOf: (userId: string) => Promise.resolve(profiles.get(userId) ?? null),
  } as OrganizerProfiles);
  const transactions: TransactionRunner = {
    run: <T>(work: (tx: TransactionContext) => Promise<T>) => work({} as TransactionContext),
  };
  const auditEntries: Record<string, unknown>[] = [];
  const audit = new AuditLog(
    {
      append: (entry: Record<string, unknown>) => {
        auditEntries.push(entry);
        return Promise.resolve();
      },
    } as never,
    clock,
    ids,
  );
  // The real renderer has tests of its own (infra); here it only has to be called.
  const markdown = { render: (md: string) => `<rendered>${md}</rendered>` };
  const s = {
    clock,
    events,
    auditEntries,
    list: new ListOrganizerEvents(events, scope),
    create: new CreateEvent(events, markdown, clock, ids, scope),
    get: new GetOrganizerEvent(events, scope),
    update: new UpdateEvent(events, markdown, transactions, clock, scope),
    remove: new DeleteDraftEvent(events, scope),
    publish: new PublishEvent(events, transactions, clock, ids, scope, audit),
    cancel: new CancelEvent(events, clock, scope, audit),
    addTicketType: new CreateTicketType(events, transactions, clock, ids, scope),
    updateTicketType: new UpdateTicketType(events, transactions, clock, scope),
    removeTicketType: new DeleteTicketType(events, transactions, clock, scope),
  };
  /** A draft of `caller` with everything publication needs. */
  async function completeDraft(caller: Caller = ana) {
    const event = await s.create.execute(caller, draft);
    const ticketType = await s.addTicketType.execute(caller, event.id, ticket);
    events.givePicture(event.id, "Pista cheia sob a lona");
    return { event, ticketType };
  }
  async function published(caller: Caller = ana) {
    const { event, ticketType } = await completeDraft(caller);
    await s.publish.execute(caller, event.id);
    return { event, ticketType };
  }
  return { ...s, completeDraft, published };
}

describe("drafts", () => {
  it("creates a draft with the markdown rendered on the server, and a slug from the title", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    expect(event).toMatchObject({
      status: "DRAFT",
      title: "Noite de forró no Circo",
      descriptionHtml: "<rendered>**Traga** documento.</rendered>",
      venue: draft.venue,
      ticketTypes: [],
    });
    expect(event.slug).toMatch(/^noite-de-forro-no-circo-[0-9a-f]{6}$/);
  });

  it("refuses a caller without an organizer profile, even an ADMIN", async () => {
    const s = setup();
    await expect(s.create.execute(semPerfil, draft)).rejects.toThrow(NotOrganizerError);
    await expect(s.list.execute(semPerfil, { limit: 10 })).rejects.toThrow(NotOrganizerError);
  });

  it("renders the description again when it changes, and keeps it when it does not", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    const renamed = await s.update.execute(ana, event.id, { title: "Forró de dezembro" });
    expect(renamed.descriptionHtml).toBe(event.descriptionHtml);
    const described = await s.update.execute(ana, event.id, { descriptionMd: "# Line-up" });
    expect(described.descriptionHtml).toBe("<rendered># Line-up</rendered>");
  });

  it("refuses an end before the start once merged with what the event has", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    await expect(
      s.update.execute(ana, event.id, { endsAt: "2026-12-05T21:00:00Z" }),
    ).rejects.toThrow(InvalidEventInputError);
  });

  it("lets a draft drop its venue, and deletes only drafts", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    expect((await s.update.execute(ana, event.id, { venue: null })).venue).toBeNull();
    await s.remove.execute(ana, event.id);
    await expect(s.get.execute(ana, event.id)).rejects.toThrow(EventNotFoundError);

    const { event: live } = await s.published();
    await expect(s.remove.execute(ana, live.id)).rejects.toThrow(InvalidTransitionError);
  });
});

describe("an organizer never reaches another organizer's events", () => {
  it("answers not found to every operation on someone else's event", async () => {
    const s = setup();
    const { event, ticketType } = await s.completeDraft(ana);
    const attempts = [
      s.get.execute(bia, event.id),
      s.update.execute(bia, event.id, { title: "Tomado" }),
      s.remove.execute(bia, event.id),
      s.publish.execute(bia, event.id),
      s.cancel.execute(bia, event.id, { reason: "Tomado" }),
      s.addTicketType.execute(bia, event.id, ticket),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toThrow(EventNotFoundError);
    await expect(s.updateTicketType.execute(bia, ticketType.id, { capacity: 1 })).rejects.toThrow(
      TicketTypeNotFoundError,
    );
    await expect(s.removeTicketType.execute(bia, ticketType.id)).rejects.toThrow(
      TicketTypeNotFoundError,
    );

    // And nothing changed.
    const intact = await s.get.execute(ana, event.id);
    expect(intact).toMatchObject({ title: draft.title, status: "DRAFT" });
    expect(intact.ticketTypes).toHaveLength(1);
  });

  it("lists only the caller's own events", async () => {
    const s = setup();
    await s.create.execute(ana, draft);
    await s.create.execute(bia, { ...draft, title: "Evento da Bia" });
    const page = await s.list.execute(bia, { limit: 10 });
    expect(page.events.map((e) => e.title)).toEqual(["Evento da Bia"]);
  });
});

describe("publication", () => {
  it("lists everything an incomplete draft lacks", async () => {
    const s = setup();
    const { venue: _venue, ...noVenue } = draft;
    const event = await s.create.execute(ana, noVenue);
    const error = await s.publish.execute(ana, event.id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect((error as InvalidTransitionError).missing.map((m) => m.path)).toEqual([
      "venue",
      "image",
      "ticketTypes",
    ]);
  });

  it("refuses a draft whose date has passed", async () => {
    const s = setup();
    const { event } = await s.completeDraft();
    s.clock.current = new Date("2026-12-05T23:00:00Z");
    const error = (await s.publish
      .execute(ana, event.id)
      .catch((e: unknown) => e)) as InvalidTransitionError;
    expect(error.missing.map((m) => m.path)).toEqual(["startsAt"]);
  });

  it("publishes a complete draft once, with a fresh slug from the final title, and audits it", async () => {
    const s = setup();
    const { event } = await s.completeDraft();
    await s.update.execute(ana, event.id, { title: "Forró de dezembro" });
    const live = await s.publish.execute(ana, event.id, { requestId: "req-1" });
    expect(live).toMatchObject({ status: "PUBLISHED", publishedAt: s.clock.current });
    expect(live.slug).toMatch(/^forro-de-dezembro-[0-9a-f]{6}$/);
    expect(s.auditEntries).toEqual([
      expect.objectContaining({
        action: "event.published",
        entityType: "event",
        entityId: event.id,
        actorId: ana.id,
        requestId: "req-1",
      }),
    ]);
    await expect(s.publish.execute(ana, event.id)).rejects.toThrow(InvalidTransitionError);
  });

  it("keeps a published event complete: no clearing the venue, no moving it to the past", async () => {
    const s = setup();
    const { event, ticketType } = await s.published();
    await expect(s.update.execute(ana, event.id, { venue: null })).rejects.toThrow(
      InvalidTransitionError,
    );
    await expect(
      s.update.execute(ana, event.id, {
        startsAt: "2026-10-01T22:00:00Z",
        endsAt: "2026-10-02T03:00:00Z",
      }),
    ).rejects.toThrow(InvalidTransitionError);
    await expect(s.removeTicketType.execute(ana, ticketType.id)).rejects.toThrow(
      InvalidTransitionError,
    );
    // Other edits are fine.
    expect((await s.update.execute(ana, event.id, { title: "Forró, edição 2" })).title).toBe(
      "Forró, edição 2",
    );
  });
});

describe("cancellation", () => {
  it("cancels a published event with its reason, once, and audits it", async () => {
    const s = setup();
    const { event } = await s.published();
    const canceled = await s.cancel.execute(ana, event.id, { reason: "Chuva forte prevista" });
    expect(canceled).toMatchObject({ status: "CANCELED", cancelReason: "Chuva forte prevista" });
    expect(s.auditEntries.map((e) => e["action"])).toEqual(["event.published", "event.canceled"]);
    await expect(s.cancel.execute(ana, event.id, { reason: "De novo" })).rejects.toThrow(
      InvalidTransitionError,
    );
  });

  it("does not cancel a draft (it is deleted) nor an event that is over", async () => {
    const s = setup();
    const { event: rascunho } = await s.completeDraft();
    await expect(s.cancel.execute(ana, rascunho.id, { reason: "Não vai rolar" })).rejects.toThrow(
      InvalidTransitionError,
    );
    const { event } = await s.published();
    s.clock.current = new Date("2026-12-07T00:00:00Z");
    await expect(s.cancel.execute(ana, event.id, { reason: "Tarde demais" })).rejects.toThrow(
      InvalidTransitionError,
    );
  });

  it("freezes a canceled event: no edits, no ticket type changes", async () => {
    const s = setup();
    const { event, ticketType } = await s.published();
    await s.cancel.execute(ana, event.id, { reason: "Chuva forte prevista" });
    await expect(s.update.execute(ana, event.id, { title: "Volta" })).rejects.toThrow(
      InvalidTransitionError,
    );
    await expect(s.addTicketType.execute(ana, event.id, ticket)).rejects.toThrow(
      InvalidTransitionError,
    );
    await expect(
      s.updateTicketType.execute(ana, ticketType.id, { priceCents: 100 }),
    ).rejects.toThrow(InvalidTransitionError);
  });
});

describe("ticket types", () => {
  it("are added at the end of the list", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    await s.addTicketType.execute(ana, event.id, { ...ticket, name: "Pista" });
    const camarote = await s.addTicketType.execute(ana, event.id, { ...ticket, name: "Camarote" });
    expect(camarote).toMatchObject({ sortOrder: 1, sold: 0, reserved: 0 });
    expect((await s.get.execute(ana, event.id)).ticketTypes.map((t) => t.name)).toEqual([
      "Pista",
      "Camarote",
    ]);
  });

  it("never drop their capacity below what is sold and reserved", async () => {
    const s = setup();
    const { ticketType } = await s.published();
    s.events.sell(ticketType.id, 30, 5);
    await expect(s.updateTicketType.execute(ana, ticketType.id, { capacity: 34 })).rejects.toThrow(
      InventoryConflictError,
    );
    expect((await s.updateTicketType.execute(ana, ticketType.id, { capacity: 35 })).capacity).toBe(
      35,
    );
  });

  it("are not deleted once anything of them is sold or reserved", async () => {
    const s = setup();
    const { event, ticketType } = await s.published();
    await s.addTicketType.execute(ana, event.id, { ...ticket, name: "Camarote" });
    s.events.sell(ticketType.id, 0, 1);
    await expect(s.removeTicketType.execute(ana, ticketType.id)).rejects.toThrow(
      InventoryConflictError,
    );
  });

  it("sell within a window that ends by the end of the event", async () => {
    const s = setup();
    const event = await s.create.execute(ana, draft);
    await expect(
      s.addTicketType.execute(ana, event.id, { ...ticket, salesEndAt: "2026-12-07T00:00:00Z" }),
    ).rejects.toThrow(InvalidEventInputError);
    const ticketType = await s.addTicketType.execute(ana, event.id, {
      ...ticket,
      salesStartAt: "2026-11-01T12:00:00Z",
    });
    await expect(
      s.updateTicketType.execute(ana, ticketType.id, { salesEndAt: "2026-10-31T12:00:00Z" }),
    ).rejects.toThrow(InvalidEventInputError);
  });
});

describe("the organizer's list", () => {
  it("pages newest first without repeating or skipping, and filters by status", async () => {
    const s = setup();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await s.create.execute(ana, { ...draft, title: `Evento ${i}` })).id);
      s.clock.current = new Date(s.clock.current.getTime() + 1000);
    }
    const seen: string[] = [];
    let after: { createdAt: Date; id: string } | undefined;
    for (;;) {
      const page = await s.list.execute(ana, { limit: 2, ...(after ? { after } : {}) });
      seen.push(...page.events.map((e) => e.id));
      if (!page.next) break;
      after = page.next;
    }
    expect(seen).toEqual([...ids].reverse());

    const { event } = await s.published();
    const live = await s.list.execute(ana, { limit: 10, status: "PUBLISHED" });
    expect(live.events.map((e) => e.id)).toEqual([event.id]);
    expect(live.events[0]?.ticketTypeCount).toBe(1);
  });
});
