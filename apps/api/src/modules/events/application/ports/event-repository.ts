import type { EventStatus } from "@vira/shared";

import type { TransactionContext } from "../../../../platform/database/transaction.js";
import type { Event, TicketType, Venue } from "../../domain/event.js";

/** The columns a new draft starts with; the rest take their defaults. */
export interface NewEvent {
  readonly id: string;
  readonly organizerId: string;
  readonly slug: string;
  readonly title: string;
  readonly descriptionMd: string;
  readonly descriptionHtml: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly timezone: string;
  readonly venue: Venue | null;
  readonly createdAt: Date;
}

/** What an edit may change. `venue: null` clears it; an absent key leaves it as is. */
export interface EventChanges {
  readonly title?: string;
  readonly descriptionMd?: string;
  readonly descriptionHtml?: string;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly timezone?: string;
  readonly venue?: Venue | null;
}

export type NewTicketType = Omit<TicketType, "sold" | "reserved">;

export interface TicketTypeChanges {
  readonly name?: string;
  readonly description?: string | null;
  readonly priceCents?: number;
  readonly capacity?: number;
  readonly maxPerOrder?: number;
  readonly salesStartAt?: Date | null;
  readonly salesEndAt?: Date | null;
  readonly sortOrder?: number;
}

/** Position after which the next page starts: newest first, the id breaking ties. */
export interface EventListPosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface EventListQuery {
  readonly status?: EventStatus;
  readonly after?: EventListPosition;
  readonly limit: number;
}

/** A row of the organizer's list. */
export type EventSummary = Omit<Event, "ticketTypes" | "descriptionMd" | "descriptionHtml"> & {
  readonly ticketTypeCount: number;
};

/**
 * Events are always reached through their organizer: every lookup takes the organizer's
 * id, so an event of someone else is simply not found (docs/API.md, OWASP API1 — BOLA).
 */
export interface EventRepository {
  /** Answers `false` when the slug is taken (the caller picks another). */
  create(event: NewEvent): Promise<boolean>;

  /**
   * The organizer's event with its ticket types. With `lock`, inside a transaction, the
   * event row stays locked until it ends, so checks and writes on the event and its
   * ticket types see no concurrent change (publishing while a ticket type is deleted).
   */
  findOwned(
    eventId: string,
    organizerId: string,
    options?: { readonly tx?: TransactionContext; readonly lock?: boolean },
  ): Promise<Event | null>;

  /** The event a ticket type belongs to, if it is the organizer's (same `lock` as above). */
  findOwnedByTicketType(
    ticketTypeId: string,
    organizerId: string,
    options?: { readonly tx?: TransactionContext; readonly lock?: boolean },
  ): Promise<Event | null>;

  /** Newest first; `limit + 1` rows at most, so the caller knows whether more follow. */
  listOwned(organizerId: string, query: EventListQuery): Promise<EventSummary[]>;

  update(eventId: string, changes: EventChanges, tx?: TransactionContext): Promise<void>;

  /** Deletes the event only if it is still a draft; answers whether it did. */
  deleteDraft(eventId: string, organizerId: string): Promise<boolean>;

  /** DRAFT → PUBLISHED, with the slug of the final title; `false` if it was no longer a draft. */
  publish(
    eventId: string,
    change: { readonly slug: string; readonly publishedAt: Date },
    tx?: TransactionContext,
  ): Promise<"published" | "not-draft" | "slug-taken">;

  /** PUBLISHED → CANCELED; `false` if it was no longer published. */
  cancel(
    eventId: string,
    change: { readonly reason: string; readonly canceledAt: Date },
    tx?: TransactionContext,
  ): Promise<boolean>;

  createTicketType(ticketType: NewTicketType, tx?: TransactionContext): Promise<void>;

  /**
   * Applies the changes unless the new capacity is below what is already sold or
   * reserved (checked in the same statement, as orders may reserve meanwhile).
   */
  updateTicketType(
    ticketTypeId: string,
    changes: TicketTypeChanges,
    tx?: TransactionContext,
  ): Promise<"updated" | "below-committed">;

  /** Deletes the ticket type only if nothing of it is sold or reserved. */
  deleteUnsoldTicketType(ticketTypeId: string, tx?: TransactionContext): Promise<boolean>;
}

export const EVENT_REPOSITORY = Symbol("EVENT_REPOSITORY");
