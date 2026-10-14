const RETURN_PATH_MAX_LENGTH = 512;

/**
 * Whether `path` is safe to send the browser to after signing in: a path on this site,
 * never `//other.site`, an absolute URL or a backslash trick (no open redirect). The
 * same rule the API applies to the `next` of the social login.
 */
export function isSafeReturnPath(path: string): boolean {
  return (
    path.length <= RETURN_PATH_MAX_LENGTH &&
    /^\/(?![/\\])[\x21-\x7e]*$/.test(path) &&
    !path.includes("\\")
  );
}

/** The `next` search parameter when it is safe, otherwise `fallback`. */
export function returnPathFrom(next: string | null | undefined, fallback = "/"): string {
  return next !== null && next !== undefined && isSafeReturnPath(next) ? next : fallback;
}
