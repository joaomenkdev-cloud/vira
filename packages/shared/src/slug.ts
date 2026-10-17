/**
 * Lower-case ASCII letters and digits in words joined by `-` ("Coletivo São João" becomes
 * "coletivo-sao-joao"), cut to `maxLength`. Empty when nothing of the text survives
 * (only emoji or symbols): each caller picks its own fallback.
 */
export function slugify(text: string, maxLength: number): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // accents split off by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, "");
}
