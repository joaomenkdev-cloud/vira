import type {
  CancelEventRequest,
  CreateEventRequest,
  CreateTicketTypeRequest,
  EventImageContentType,
  EventStatus,
  ImageUpload,
  OrganizerEvent,
  OrganizerEventList,
  TicketTypeBody,
  UpdateEventRequest,
  UpdateTicketTypeRequest,
} from "@vira/shared";

import { api } from "./browser";
import { ApiError } from "./errors";

/*
 * The organizer's routes (docs/API.md, "Eventos do organizador"). Every one of them
 * answers 404 for an event of someone else, exactly as for one that does not exist.
 */

const eventPath = (id: string) => `/organizer/events/${encodeURIComponent(id)}`;
const ticketTypePath = (id: string) => `/organizer/ticket-types/${encodeURIComponent(id)}`;

export function listOrganizerEvents(
  options: { status?: EventStatus | undefined; cursor?: string | undefined } = {},
): Promise<OrganizerEventList> {
  const query = new URLSearchParams();
  if (options.status) query.set("status", options.status);
  if (options.cursor) query.set("cursor", options.cursor);
  const search = query.size > 0 ? `?${query.toString()}` : "";
  return api.request(`/organizer/events${search}`);
}

export function getOrganizerEvent(id: string): Promise<OrganizerEvent> {
  return api.request(eventPath(id));
}

export function createEvent(body: CreateEventRequest): Promise<OrganizerEvent> {
  return api.request("/organizer/events", { method: "POST", body, csrf: true });
}

export function updateEvent(id: string, body: UpdateEventRequest): Promise<OrganizerEvent> {
  return api.request(eventPath(id), { method: "PATCH", body, csrf: true });
}

export async function deleteEvent(id: string): Promise<void> {
  await api.request(eventPath(id), { method: "DELETE", csrf: true });
}

export function publishEvent(id: string): Promise<OrganizerEvent> {
  return api.request(`${eventPath(id)}/publish`, { method: "POST", csrf: true });
}

export function cancelEvent(id: string, body: CancelEventRequest): Promise<OrganizerEvent> {
  return api.request(`${eventPath(id)}/cancel`, { method: "POST", body, csrf: true });
}

export function createTicketType(
  eventId: string,
  body: CreateTicketTypeRequest,
): Promise<TicketTypeBody> {
  return api.request(`${eventPath(eventId)}/ticket-types`, { method: "POST", body, csrf: true });
}

export function updateTicketType(
  id: string,
  body: UpdateTicketTypeRequest,
): Promise<TicketTypeBody> {
  return api.request(ticketTypePath(id), { method: "PATCH", body, csrf: true });
}

export async function deleteTicketType(id: string): Promise<void> {
  await api.request(ticketTypePath(id), { method: "DELETE", csrf: true });
}

/**
 * The three steps of a new picture (docs/API.md, "Imagem do evento"): a pre-signed URL
 * from the API, the file straight from the browser to the bucket (never through the
 * API), then the confirmation, where the API checks and re-encodes it.
 */
export async function uploadEventImage(
  eventId: string,
  file: File,
  alt: string,
): Promise<OrganizerEvent> {
  const upload = await api.request<ImageUpload>(`${eventPath(eventId)}/image/upload-url`, {
    method: "POST",
    body: { contentType: file.type as EventImageContentType, sizeBytes: file.size },
    csrf: true,
  });

  let stored: Response;
  try {
    stored = await fetch(upload.url, { method: "PUT", body: file, headers: upload.headers });
  } catch {
    throw new ApiError({ status: 0, code: "network-error" });
  }
  // The bucket answers in XML, not problem details: what matters is that it refused.
  if (!stored.ok) throw new ApiError({ status: stored.status, code: "unavailable" });

  return api.request(`${eventPath(eventId)}/image`, {
    method: "POST",
    body: { uploadId: upload.uploadId, alt },
    csrf: true,
  });
}
