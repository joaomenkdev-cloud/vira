import type { MissingRequirement } from "../domain/event.js";
import type { ImageRejection } from "./ports/image-processor.js";

/** The caller has no organizer profile, so there are no events to manage. */
export class NotOrganizerError extends Error {
  constructor() {
    super("The account has no organizer profile");
    this.name = "NotOrganizerError";
  }
}

/** No such event, or it belongs to another organizer (the two look the same). */
export class EventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "EventNotFoundError";
  }
}

/** No such ticket type, or its event belongs to another organizer. */
export class TicketTypeNotFoundError extends Error {
  constructor() {
    super("Ticket type not found");
    this.name = "TicketTypeNotFoundError";
  }
}

/**
 * The event's status does not allow the operation (publishing a canceled event, editing
 * an ended one, deleting a published one). `missing` lists what publication still needs.
 */
export class InvalidTransitionError extends Error {
  constructor(
    readonly detail: string,
    readonly missing: readonly MissingRequirement[] = [],
  ) {
    super(detail);
    this.name = "InvalidTransitionError";
  }
}

/** Tickets already sold or reserved stand in the way (lower capacity, deletion). */
export class InventoryConflictError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "InventoryConflictError";
  }
}

/** A combination the request schema cannot see on its own (the new end before the old start). */
export class InvalidEventInputError extends Error {
  constructor(
    readonly path: string,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "InvalidEventInputError";
  }
}

/** No such upload for this event, or it was already used, or its time is up. */
export class UploadNotFoundError extends Error {
  constructor() {
    super("Upload not found");
    this.name = "UploadNotFoundError";
  }
}

/** Why an uploaded file cannot become the event's picture. */
export type UploadProblem = ImageRejection | "not-received" | "size-mismatch";

/**
 * The upload cannot be used. Except for `not-received` (the file may still arrive while
 * the URL is valid), the upload is spent: the organizer asks for a new URL.
 */
export class UnusableUploadError extends Error {
  constructor(readonly problem: UploadProblem) {
    super(`Unusable upload: ${problem}`);
    this.name = "UnusableUploadError";
  }
}
