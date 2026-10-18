import { slugify } from "@vira/shared";

/** Longest slug kept from a display name, leaving room for a `-<suffix>`. */
const BASE_MAX_LENGTH = 60;

/** Used when nothing of the display name survives (e.g. only emoji or symbols). */
const FALLBACK = "organizador";

/**
 * The public identifier of an organizer, derived from its display name: lower-case
 * ASCII letters and digits in words joined by `-` ("Coletivo São João" becomes
 * "coletivo-sao-joao"). Matches the `organizer_profiles_slug_format` CHECK.
 */
export function slugFrom(displayName: string): string {
  const slug = slugify(displayName, BASE_MAX_LENGTH);
  return slug === "" ? FALLBACK : slug;
}

/**
 * Slugs to try, in order, until one is free: the base, then numbered variants, then
 * one with a random suffix (unique in practice) supplied by the caller.
 */
export function slugCandidates(base: string, randomSuffix: string): string[] {
  return [base, ...[2, 3, 4, 5].map((n) => `${base}-${n}`), `${base}-${randomSuffix}`];
}
