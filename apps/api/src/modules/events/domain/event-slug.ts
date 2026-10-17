import { slugify } from "@vira/shared";

/** Longest part kept from the title, leaving room for `-<suffix>` within 80 characters. */
const BASE_MAX_LENGTH = 60;

/** Used when nothing of the title survives (e.g. only emoji or symbols). */
const FALLBACK = "evento";

/**
 * The public identifier of an event: its title in slug form plus a short random suffix,
 * so two events with the same title never collide ("Noite de Forró" becomes
 * "noite-de-forro-k3x9q2"). Matches the `events_slug_format` CHECK.
 */
export function eventSlug(title: string, randomSuffix: string): string {
  const base = slugify(title, BASE_MAX_LENGTH);
  return `${base === "" ? FALLBACK : base}-${randomSuffix}`;
}
