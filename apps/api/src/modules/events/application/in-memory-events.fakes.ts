import type { Event, TicketType } from "../domain/event.js";
import type {
  EventChanges,
  EventListQuery,
  EventRepository,
  EventSummary,
  NewEvent,
  NewTicketType,
  TicketTypeChanges,
} from "./ports/event-repository.js";

/** Events in memory, with the ownership filter and the conditional writes of the real one. */
export class InMemoryEvents implements EventRepository {
  readonly events = new Map<string, Omit<Event, "ticketTypes">>();
  readonly ticketTypes = new Map<string, TicketType>();

  private assemble(row: Omit<Event, "ticketTypes">): Event {
    const ticketTypes = [...this.ticketTypes.values()]
      .filter((t) => t.eventId === row.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
    return { ...row, ticketTypes };
  }

  create(event: NewEvent): Promise<boolean> {
    if ([...this.events.values()].some((e) => e.slug === event.slug)) return Promise.resolve(false);
    this.events.set(event.id, {
      ...event,
      status: "DRAFT",
      image: null,
      isDemo: false,
      publishedAt: null,
      canceledAt: null,
      cancelReason: null,
      updatedAt: event.createdAt,
    });
    return Promise.resolve(true);
  }

  findOwned(eventId: string, organizerId: string): Promise<Event | null> {
    const row = this.events.get(eventId);
    if (row?.organizerId !== organizerId) return Promise.resolve(null);
    return Promise.resolve(this.assemble(row));
  }

  findOwnedByTicketType(ticketTypeId: string, organizerId: string): Promise<Event | null> {
    const ticketType = this.ticketTypes.get(ticketTypeId);
    return ticketType ? this.findOwned(ticketType.eventId, organizerId) : Promise.resolve(null);
  }

  listOwned(organizerId: string, query: EventListQuery): Promise<EventSummary[]> {
    const { after } = query;
    const rows = [...this.events.values()]
      .filter((e) => e.organizerId === organizerId && (!query.status || e.status === query.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .filter(
        (e) =>
          !after ||
          e.createdAt < after.createdAt ||
          (e.createdAt.getTime() === after.createdAt.getTime() && e.id < after.id),
      )
      .slice(0, query.limit + 1);
    return Promise.resolve(
      rows.map(({ descriptionMd: _md, descriptionHtml: _html, ...row }) => ({
        ...row,
        ticketTypeCount: this.assemble({ ...row, descriptionMd: "", descriptionHtml: "" })
          .ticketTypes.length,
      })),
    );
  }

  update(eventId: string, changes: EventChanges): Promise<void> {
    const row = this.events.get(eventId);
    if (row) this.events.set(eventId, { ...row, ...changes });
    return Promise.resolve();
  }

  deleteDraft(eventId: string, organizerId: string): Promise<boolean> {
    const row = this.events.get(eventId);
    if (row?.organizerId !== organizerId || row.status !== "DRAFT") return Promise.resolve(false);
    this.events.delete(eventId);
    for (const t of [...this.ticketTypes.values()]) {
      if (t.eventId === eventId) this.ticketTypes.delete(t.id);
    }
    return Promise.resolve(true);
  }

  publish(
    eventId: string,
    change: { slug: string; publishedAt: Date },
  ): Promise<"published" | "not-draft" | "slug-taken"> {
    if ([...this.events.values()].some((e) => e.slug === change.slug && e.id !== eventId)) {
      return Promise.resolve("slug-taken");
    }
    const row = this.events.get(eventId);
    if (row?.status !== "DRAFT") return Promise.resolve("not-draft");
    this.events.set(eventId, { ...row, ...change, status: "PUBLISHED" });
    return Promise.resolve("published");
  }

  cancel(eventId: string, change: { reason: string; canceledAt: Date }): Promise<boolean> {
    const row = this.events.get(eventId);
    if (row?.status !== "PUBLISHED") return Promise.resolve(false);
    this.events.set(eventId, {
      ...row,
      status: "CANCELED",
      cancelReason: change.reason,
      canceledAt: change.canceledAt,
    });
    return Promise.resolve(true);
  }

  createTicketType(ticketType: NewTicketType): Promise<void> {
    this.ticketTypes.set(ticketType.id, { ...ticketType, sold: 0, reserved: 0 });
    return Promise.resolve();
  }

  updateTicketType(
    ticketTypeId: string,
    changes: TicketTypeChanges,
  ): Promise<"updated" | "below-committed"> {
    const current = this.ticketTypes.get(ticketTypeId);
    if (!current) return Promise.resolve("updated");
    if (changes.capacity !== undefined && changes.capacity < current.sold + current.reserved) {
      return Promise.resolve("below-committed");
    }
    this.ticketTypes.set(ticketTypeId, { ...current, ...changes });
    return Promise.resolve("updated");
  }

  deleteUnsoldTicketType(ticketTypeId: string): Promise<boolean> {
    const current = this.ticketTypes.get(ticketTypeId);
    if (!current || current.sold + current.reserved > 0) return Promise.resolve(false);
    this.ticketTypes.delete(ticketTypeId);
    return Promise.resolve(true);
  }

  /** What N9 (image upload) and V1 (orders) will do; the tests do it by hand. */
  setImage(eventId: string, alt: string | null): void {
    const row = this.events.get(eventId);
    if (row) this.events.set(eventId, { ...row, image: { key: `events/${eventId}/x.webp`, alt } });
  }

  sell(ticketTypeId: string, sold: number, reserved = 0): void {
    const current = this.ticketTypes.get(ticketTypeId);
    if (current) this.ticketTypes.set(ticketTypeId, { ...current, sold, reserved });
  }
}
