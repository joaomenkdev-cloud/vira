import { CATALOG_SEARCH_MAX_LENGTH, CATALOG_SEARCH_MIN_LENGTH } from "@vira/shared";

/*
 * The explore page (/eventos) keeps its search in the address, so a search can be
 * shared, bookmarked and paged without JavaScript: `?q=forró&cidade=Recife`,
 * `?periodo=fim-de-semana` and the API's `cursor` for the next page.
 */

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

export const WEEKEND = "fim-de-semana";

/** What the API is asked (GET /events), minus the page size. */
export interface CatalogQuery {
  q?: string;
  city?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface ExploreSearch {
  /** Values to put back in the form, as typed. */
  readonly q: string;
  readonly city: string;
  readonly weekend: boolean;
  /** Set when the text cannot be searched; the form explains it next to the field. */
  readonly qError: string | null;
  readonly query: CatalogQuery;
  /** Any filter at all: decides between "Próximos eventos" and the search result. */
  readonly filtered: boolean;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** São Paulo has had no daylight saving time since 2019 (Decree 9,772). */
const BRASILIA_OFFSET = "-03:00";
const DAY = 24 * 60 * 60 * 1000;

/**
 * This weekend in Brasília time: from Saturday 00:00 to Monday 00:00. On a weekday it is
 * the coming one; on Saturday or Sunday the current one (events already over drop out
 * of the API's list on their own).
 */
export function weekendRange(now: Date): { from: string; to: string } {
  // Brasília's wall clock, read as if it were UTC.
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const weekday = local.getUTCDay(); // 0 = Sunday
  const daysToSaturday = weekday === 0 ? -1 : 6 - weekday;
  const saturday = new Date(local.getTime() + daysToSaturday * DAY);
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return {
    from: `${day(saturday)}T00:00:00${BRASILIA_OFFSET}`,
    to: `${day(new Date(saturday.getTime() + 2 * DAY))}T00:00:00${BRASILIA_OFFSET}`,
  };
}

export function parseExploreSearch(params: SearchParams, now: Date): ExploreSearch {
  const q = first(params["q"]).slice(0, CATALOG_SEARCH_MAX_LENGTH);
  const city = first(params["cidade"]).slice(0, 80);
  const weekend = first(params["periodo"]) === WEEKEND;
  const cursor = first(params["cursor"]);

  const qError =
    q.length > 0 && q.length < CATALOG_SEARCH_MIN_LENGTH
      ? `Digite pelo menos ${String(CATALOG_SEARCH_MIN_LENGTH)} letras para buscar.`
      : null;

  const query: CatalogQuery = {
    ...(q && !qError ? { q } : {}),
    ...(city ? { city } : {}),
    ...(weekend ? weekendRange(now) : {}),
    ...(cursor && cursor.length <= 512 ? { cursor } : {}),
  };
  return { q, city, weekend, qError, query, filtered: Boolean(q || city || weekend) };
}

/** The address of this search with other values: the next page, a chip turned on or off. */
export function exploreHref(
  search: Pick<ExploreSearch, "q" | "city" | "weekend">,
  changes: { weekend?: boolean; cursor?: string } = {},
): string {
  const weekend = changes.weekend ?? search.weekend;
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.city) params.set("cidade", search.city);
  if (weekend) params.set("periodo", WEEKEND);
  if (changes.cursor) params.set("cursor", changes.cursor);
  const query = params.toString();
  return query ? `/eventos?${query}` : "/eventos";
}
