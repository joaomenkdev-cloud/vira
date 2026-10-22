// The organizer routes of the stand-in API (POST /api/v1/organizer/events…), kept in
// memory per account, and the public page of the events published through them. Bodies
// are checked with the real contracts of @vira/shared, so a request the API would refuse
// is refused here too; the answers follow docs/API.md ("Eventos do organizador").
import { randomUUID } from "node:crypto";
import {
  attachEventImageRequestSchema,
  cancelEventRequestSchema,
  createEventRequestSchema,
  createTicketTypeRequestSchema,
  requestImageUploadSchema,
  updateEventRequestSchema,
  updateTicketTypeRequestSchema,
  type CatalogEventDetail,
  type OrganizerEvent,
  type OrganizerEventSummary,
  type TicketTypeBody,
} from "@vira/shared";

import { encodePng } from "./png.ts";
import { STORAGE_PORT, storedObjects } from "./storage.ts";

type Body = Record<string, unknown>;

export interface OrganizerContext {
  /** The signed-in organizer (valid session, CSRF checked on writes), or undefined once answered. */
  organizer: (options: { csrf: boolean }) => { id: string; displayName: string } | undefined;
  send: (status: number, body?: unknown) => void;
  problem: (status: number, code: string, extra?: Body) => void;
}

interface StoredEvent {
  ownerId: string;
  organizerName: string;
  event: OrganizerEvent;
  imageKey: string | null;
}

interface Upload {
  eventId: string;
  contentType: string;
  sizeBytes: number;
  used: boolean;
}

const STORAGE = `http://127.0.0.1:${String(STORAGE_PORT)}`;
const events = new Map<string, StoredEvent>();
const uploads = new Map<string, Upload>();
const BLUR = `data:image/png;base64,${encodePng(16, 9, [
  [217, 45, 58],
  [242, 242, 239],
]).toString("base64")}`;

const now = () => new Date().toISOString();
const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Paragraphs of escaped text: enough markdown for the tests (the API sanitizes for real). */
function renderMarkdown(markdown: string): string {
  return markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("\n");
}

/** What the fake needs of a Zod schema (zod itself is a dependency of @vira/shared only). */
interface Schema<T> {
  safeParse(
    body: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

function parse<T>(schema: Schema<T>, body: unknown, context: OrganizerContext): T | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  context.problem(400, "validation-failed", {
    errors: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
  return undefined;
}

function summary({ event }: StoredEvent): OrganizerEventSummary {
  const {
    descriptionMd: _md,
    descriptionHtml: _html,
    image: _image,
    publishedAt: _published,
    canceledAt: _canceled,
    cancelReason: _reason,
    ticketTypes,
    ...fields
  } = event;
  return { ...fields, ticketTypeCount: ticketTypes.length };
}

function missingForPublication(event: OrganizerEvent) {
  const missing: { path: string; message: string }[] = [];
  if (Date.parse(event.startsAt) <= Date.now()) {
    missing.push({ path: "startsAt", message: "a data de início precisa estar no futuro" });
  }
  if (!event.venue) missing.push({ path: "venue", message: "informe o local do evento" });
  if (!event.image) missing.push({ path: "image", message: "envie a imagem do evento" });
  if (event.ticketTypes.length === 0) {
    missing.push({ path: "ticketTypes", message: "crie ao menos um tipo de ingresso" });
  }
  return missing;
}

/** Width and height of a PNG, from its header; `null` for anything else. */
function pngSize(bytes: Buffer): { width: number; height: number } | null {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The fields a partial update sets (Zod leaves the absent ones `undefined`). */
function defined<T extends object>(fields: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const touch = (stored: StoredEvent, changes: Partial<OrganizerEvent>) => {
  stored.event = { ...stored.event, ...changes, updatedAt: now() };
  return stored.event;
};

function locked(stored: StoredEvent, context: OrganizerContext): boolean {
  const { status, endsAt } = stored.event;
  if (status === "CANCELED" || (status === "PUBLISHED" && Date.parse(endsAt) <= Date.now())) {
    context.problem(409, "invalid-state-transition", {
      detail: "O evento foi cancelado ou já terminou e não pode mais ser alterado.",
    });
    return true;
  }
  return false;
}

/** Answers /api/v1/organizer/*; returns false for any other path. */
export function handleOrganizer(
  method: string,
  path: string,
  url: URL,
  body: Body,
  context: OrganizerContext,
): boolean {
  if (!path.startsWith("/organizer/")) return false;
  const organizer = context.organizer({ csrf: method !== "GET" });
  if (!organizer) return true;

  const own = (id: string | undefined) => {
    const stored = events.get(id ?? "");
    if (stored?.ownerId === organizer.id) return stored;
    context.problem(404, "not-found");
    return undefined;
  };
  const ownTicketType = (id: string | undefined) => {
    for (const stored of events.values()) {
      if (stored.ownerId !== organizer.id) continue;
      const ticketType = stored.event.ticketTypes.find((item) => item.id === id);
      if (ticketType) return { stored, ticketType };
    }
    context.problem(404, "not-found");
    return undefined;
  };

  if (path === "/organizer/events" && method === "GET") {
    const status = url.searchParams.get("status");
    const scope = `${organizer.id}|${status ?? ""}`;
    let offset = 0;
    const cursor = url.searchParams.get("cursor");
    if (cursor) {
      const [cursorScope, cursorOffset] = Buffer.from(cursor, "base64url").toString().split("#");
      if (cursorScope !== scope) {
        context.problem(400, "validation-failed");
        return true;
      }
      offset = Number(cursorOffset);
    }
    const limit = 20;
    const mine = [...events.values()]
      .filter((stored) => stored.ownerId === organizer.id)
      .filter((stored) => !status || stored.event.status === status)
      .sort((a, b) => Date.parse(b.event.createdAt) - Date.parse(a.event.createdAt));
    const page = mine.slice(offset, offset + limit);
    const next = offset + limit < mine.length;
    context.send(200, {
      data: page.map(summary),
      page: {
        limit,
        nextCursor: next
          ? Buffer.from(`${scope}#${String(offset + limit)}`).toString("base64url")
          : null,
      },
    });
    return true;
  }

  if (path === "/organizer/events" && method === "POST") {
    const request = parse(createEventRequestSchema, body, context);
    if (!request) return true;
    const id = randomUUID();
    const created = now();
    const stored: StoredEvent = {
      ownerId: organizer.id,
      organizerName: organizer.displayName,
      imageKey: null,
      event: {
        id,
        slug: `rascunho-${id.slice(0, 8)}`,
        title: request.title,
        status: "DRAFT",
        startsAt: new Date(request.startsAt).toISOString(),
        endsAt: new Date(request.endsAt).toISOString(),
        timezone: request.timezone,
        venue: request.venue ?? null,
        isDemo: false,
        descriptionMd: request.descriptionMd,
        descriptionHtml: renderMarkdown(request.descriptionMd),
        image: null,
        publishedAt: null,
        canceledAt: null,
        cancelReason: null,
        ticketTypes: [],
        createdAt: created,
        updatedAt: created,
      },
    };
    events.set(id, stored);
    context.send(201, stored.event);
    return true;
  }

  const eventRoute = /^\/organizer\/events\/([^/]+)(?:\/(.+))?$/.exec(path);
  if (eventRoute) {
    const [, id, action] = eventRoute;
    const stored = own(id);
    if (!stored) return true;
    const { event } = stored;
    const route = `${method} ${action ?? ""}`;

    switch (route) {
      case "GET ":
        context.send(200, event);
        return true;

      case "PATCH ": {
        const request = parse(updateEventRequestSchema, body, context);
        if (!request || locked(stored, context)) return true;
        const { venue, startsAt, endsAt, descriptionMd, ...rest } = request;
        const next = touch(stored, {
          ...defined(rest),
          ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}),
          ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}),
          ...(venue === undefined ? {} : { venue }),
          ...(descriptionMd === undefined
            ? {}
            : { descriptionMd, descriptionHtml: renderMarkdown(descriptionMd) }),
        });
        context.send(200, next);
        return true;
      }

      case "DELETE ":
        if (event.status !== "DRAFT") {
          context.problem(409, "invalid-state-transition", {
            detail: "Só rascunhos podem ser excluídos; cancele o evento publicado.",
          });
          return true;
        }
        events.delete(event.id);
        context.send(204);
        return true;

      case "POST publish": {
        if (event.status !== "DRAFT") {
          context.problem(409, "invalid-state-transition", {
            detail: "Só rascunhos podem ser publicados.",
          });
          return true;
        }
        const missing = missingForPublication(event);
        if (missing.length > 0) {
          context.problem(409, "invalid-state-transition", {
            detail: "O evento ainda não pode ser publicado.",
            errors: missing,
          });
          return true;
        }
        const slug = `${event.title
          .normalize("NFD")
          .replaceAll(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, "-")
          .replaceAll(/^-|-$/g, "")}-${event.id.slice(0, 6)}`;
        context.send(200, touch(stored, { status: "PUBLISHED", slug, publishedAt: now() }));
        return true;
      }

      case "POST cancel": {
        const request = parse(cancelEventRequestSchema, body, context);
        if (!request) return true;
        if (event.status !== "PUBLISHED" || locked(stored, context)) {
          if (event.status !== "PUBLISHED") {
            context.problem(409, "invalid-state-transition", {
              detail: "Só eventos publicados podem ser cancelados.",
            });
          }
          return true;
        }
        context.send(
          200,
          touch(stored, { status: "CANCELED", canceledAt: now(), cancelReason: request.reason }),
        );
        return true;
      }

      case "POST image/upload-url": {
        const request = parse(requestImageUploadSchema, body, context);
        if (!request || locked(stored, context)) return true;
        const uploadId = randomUUID();
        uploads.set(uploadId, { eventId: event.id, ...request, used: false });
        context.send(201, {
          uploadId,
          url: `${STORAGE}/vira-media/uploads/${uploadId}`,
          headers: { "content-type": request.contentType },
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        });
        return true;
      }

      case "POST image": {
        const request = parse(attachEventImageRequestSchema, body, context);
        if (!request || locked(stored, context)) return true;
        const upload = uploads.get(request.uploadId);
        if (upload?.eventId !== event.id || upload.used) {
          context.problem(404, "not-found");
          return true;
        }
        const object = storedObjects.get(`/vira-media/uploads/${request.uploadId}`);
        if (!object) {
          context.problem(422, "invalid-image", {
            detail: "O arquivo ainda não chegou. Envie-o pela URL recebida e confirme de novo.",
          });
          return true;
        }
        upload.used = true;
        const size = pngSize(object.body);
        if (object.body.length !== upload.sizeBytes || !size) {
          context.problem(422, "invalid-image", {
            detail: "O arquivo não é uma imagem JPEG, PNG ou WebP.",
          });
          return true;
        }
        if (size.width < 1200 || size.height < 600) {
          context.problem(422, "invalid-image", {
            detail: "A imagem precisa ter ao menos 1200 × 600 pixels.",
          });
          return true;
        }
        const key = `/vira-media/events/${event.id}/${randomUUID()}.png`;
        storedObjects.set(key, object);
        stored.imageKey = key;
        const image = { url: `${STORAGE}${key}`, alt: request.alt, ...size, blurDataUrl: BLUR };
        context.send(200, touch(stored, { image }));
        return true;
      }

      case "POST ticket-types": {
        const request = parse(createTicketTypeRequestSchema, body, context);
        if (!request || locked(stored, context)) return true;
        const ticketType: TicketTypeBody = {
          id: randomUUID(),
          name: request.name,
          description: request.description ?? null,
          price: { amountCents: request.priceCents, currency: "BRL" },
          capacity: request.capacity,
          sold: 0,
          reserved: 0,
          maxPerOrder: request.maxPerOrder,
          salesStartAt: request.salesStartAt ?? null,
          salesEndAt: request.salesEndAt ?? null,
          sortOrder: event.ticketTypes.length,
        };
        touch(stored, { ticketTypes: [...event.ticketTypes, ticketType] });
        context.send(201, ticketType);
        return true;
      }

      default:
        context.problem(404, "not-found");
        return true;
    }
  }

  const ticketTypeRoute = /^\/organizer\/ticket-types\/([^/]+)$/.exec(path);
  if (ticketTypeRoute) {
    const found = ownTicketType(ticketTypeRoute[1]);
    if (!found) return true;
    const { stored, ticketType } = found;
    if (method === "PATCH") {
      const request = parse(updateTicketTypeRequestSchema, body, context);
      if (!request || locked(stored, context)) return true;
      const { priceCents, ...rest } = request;
      const updated: TicketTypeBody = {
        ...ticketType,
        ...defined(rest),
        ...(priceCents === undefined
          ? {}
          : { price: { amountCents: priceCents, currency: "BRL" } }),
      };
      touch(stored, {
        ticketTypes: stored.event.ticketTypes.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      });
      context.send(200, updated);
      return true;
    }
    if (method === "DELETE") {
      if (locked(stored, context)) return true;
      if (stored.event.status === "PUBLISHED" && stored.event.ticketTypes.length === 1) {
        context.problem(409, "invalid-state-transition", {
          detail: "Um evento publicado precisa de ao menos um tipo de ingresso.",
        });
        return true;
      }
      touch(stored, {
        ticketTypes: stored.event.ticketTypes.filter((item) => item.id !== ticketType.id),
      });
      context.send(204);
      return true;
    }
  }

  context.problem(404, "not-found");
  return true;
}

/**
 * A published event of `owner` that started an hour ago, as if built in the panel, for
 * the check-in tests (the door opens on the night of the event).
 */
export function seedPublishedEvent(
  owner: { id: string; displayName: string },
  title: string,
): OrganizerEvent {
  const id = randomUUID();
  const created = now();
  const hour = 60 * 60 * 1000;
  const event: OrganizerEvent = {
    id,
    slug: `evento-${id.slice(0, 8)}`,
    title,
    status: "PUBLISHED",
    startsAt: new Date(Date.now() - hour).toISOString(),
    endsAt: new Date(Date.now() + 4 * hour).toISOString(),
    timezone: "America/Sao_Paulo",
    venue: {
      name: "Circo Voador",
      address: "Rua dos Arcos, s/n",
      city: "Rio de Janeiro",
      state: "RJ",
    },
    isDemo: false,
    descriptionMd: "",
    descriptionHtml: "",
    image: null,
    publishedAt: created,
    canceledAt: null,
    cancelReason: null,
    ticketTypes: [],
    createdAt: created,
    updatedAt: created,
  };
  events.set(id, { ownerId: owner.id, organizerName: owner.displayName, imageKey: null, event });
  return event;
}

/** Whether the organizer has a published event that has not ended (account deletion, V9). */
export function hasUpcomingPublishedEvents(ownerId: string): boolean {
  const now = Date.now();
  return [...events.values()].some(
    ({ ownerId: owner, event }) =>
      owner === ownerId && event.status === "PUBLISHED" && Date.parse(event.endsAt) > now,
  );
}

/** Who owns an event of the panel, for the check-in routes. */
export function organizerEventOwner(id: string): string | undefined {
  return events.get(id)?.ownerId;
}

/** The public page of an event published through the panel (GET /api/v1/events/{slug}). */
export function publishedEventDetail(slug: string): CatalogEventDetail | undefined {
  const stored = [...events.values()].find(
    ({ event }) => event.slug === slug && event.status !== "DRAFT",
  );
  if (!stored) return undefined;
  const { event } = stored;
  const { venue, image } = event;
  if (!venue || !image) return undefined;
  const prices = event.ticketTypes.map((ticketType) => ticketType.price.amountCents);
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    status: event.status === "CANCELED" ? "CANCELED" : "PUBLISHED",
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    isDemo: false,
    priceFrom: prices.length > 0 ? { amountCents: Math.min(...prices), currency: "BRL" } : null,
    soldOut: false,
    descriptionHtml: event.descriptionHtml,
    venue,
    image: { ...image, credit: null },
    organizer: { name: stored.organizerName },
    ticketTypes:
      event.status === "CANCELED"
        ? []
        : event.ticketTypes.map((ticketType) => ({
            id: ticketType.id,
            name: ticketType.name,
            description: ticketType.description,
            price: ticketType.price,
            maxPerOrder: ticketType.maxPerOrder,
            available: ticketType.capacity - ticketType.sold - ticketType.reserved,
            salesStartAt: ticketType.salesStartAt,
            salesEndAt: ticketType.salesEndAt,
            salesStatus: "ON_SALE",
          })),
  };
}
