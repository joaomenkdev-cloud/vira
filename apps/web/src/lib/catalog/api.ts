import { cache } from "react";
import {
  type CatalogEventDetail,
  catalogEventDetailSchema,
  type CatalogEventList,
  catalogEventListSchema,
  EVENT_SLUG_PATTERN,
  type FeaturedEvents,
  featuredEventsSchema,
} from "@vira/shared";

import { resolveApiOrigin } from "../../config/api-origin";

import type { CatalogQuery } from "./search";

/*
 * The storefront, read by the server while it renders a page (docs/API.md, "Vitrine").
 * Straight to the API, not through the /api/v1 proxy: there is no session to carry.
 * Nothing is cached: the photos' signed addresses last one hour, and what is left of
 * each ticket changes with every sale.
 */

/** A page waits this long for the API before showing its error state. */
const TIMEOUT_MS = 8000;
export const PAGE_SIZE = 12;

/** The API did not answer as it should; the route's error page takes over. */
export class CatalogUnavailableError extends Error {
  override readonly name = "CatalogUnavailableError";
}

/** The cursor of a "more events" link was refused (edited, or carried to another search). */
export class InvalidCursorError extends Error {
  override readonly name = "InvalidCursorError";
}

/** The part of a Zod schema used here (the web app does not depend on Zod itself). */
interface Schema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: unknown };
}

async function get<T>(path: string, schema: Schema<T>): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiOrigin(process.env)}/api/v1${path}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new CatalogUnavailableError("The API could not be reached.", { cause: error });
  }
  if (response.status === 404) return null;
  if (response.status === 400) throw new InvalidCursorError("The API refused the query.");
  if (!response.ok) {
    throw new CatalogUnavailableError(`The API answered ${String(response.status)}.`);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new CatalogUnavailableError("The API answered with an unexpected body.", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** Up to six upcoming events with tickets on sale, for the home page. */
export async function getFeaturedEvents(): Promise<FeaturedEvents> {
  return (await get("/events/featured", featuredEventsSchema)) ?? { data: [] };
}

/** Published events that have not ended, soonest first, a page at a time. */
export async function listEvents(query: CatalogQuery): Promise<CatalogEventList> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(query) as [string, string | undefined][]) {
    if (value) params.set(key, value);
  }
  return (
    (await get(`/events?${params.toString()}`, catalogEventListSchema)) ?? {
      data: [],
      page: { limit: PAGE_SIZE, nextCursor: null },
    }
  );
}

/**
 * The event page, or `null` when there is no published event with this slug. Cached for
 * the request, so the metadata and the page share one call.
 */
export const getEvent = cache(async (slug: string): Promise<CatalogEventDetail | null> => {
  if (slug.length > 80 || !EVENT_SLUG_PATTERN.test(slug)) return null;
  return get(`/events/${slug}`, catalogEventDetailSchema);
});

/** Whether the event is over, by the server's clock at the time of the request. */
export function hasEnded(event: Pick<CatalogEventDetail, "endsAt">, now = new Date()): boolean {
  return Date.parse(event.endsAt) <= now.getTime();
}
