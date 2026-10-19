const LOCAL_API_ORIGIN = "http://127.0.0.1:3000";
/** Where the local SeaweedFS answers S3 (docker-compose.yml, ADR-0012). */
const LOCAL_STORAGE_ORIGIN = "http://127.0.0.1:8333";
const LOCAL_SITE_URL = "http://localhost:3001";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Reads an origin from `env[name]`: the local default outside deployments, required on
 * Vercel, https unless it points at the loopback interface, and an origin only. The
 * error never repeats the value, which may hold a host that is not public.
 */
function resolveOrigin(env: Env, name: string, localDefault: string): string {
  const deployed = env["VERCEL"] !== undefined;
  const raw = env[name] ?? (deployed ? undefined : localDefault);
  if (raw === undefined || raw === "") {
    throw new Error(`${name} is required in deployments.`);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} must use http or https.`);
  }
  if (url.protocol === "http:" && !isLoopback(url.origin)) {
    throw new Error(`${name} must use https unless it points at the loopback interface.`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`${name} must not contain credentials.`);
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(`${name} must be an origin only: no path, query or fragment.`);
  }
  return url.origin;
}

/** Whether an origin is on this machine (local development and the end-to-end tests). */
export function isLoopback(origin: string): boolean {
  return LOOPBACK_HOSTS.has(new URL(origin).hostname);
}

/**
 * Where `/api/v1/*` is proxied to, and where the server-rendered pages read the
 * storefront from. The browser only ever talks to the web origin, so the session
 * cookies stay first-party (ADR-0005). Read when the app is built.
 */
export function resolveApiOrigin(env: Env): string {
  return resolveOrigin(env, "API_ORIGIN", LOCAL_API_ORIGIN);
}

/**
 * The object storage the event photos come from (signed addresses the API hands out,
 * docs/API.md). Only this origin may feed the image optimizer. Read when the app is built.
 */
export function resolveStorageOrigin(env: Env): string {
  return resolveOrigin(env, "STORAGE_ORIGIN", LOCAL_STORAGE_ORIGIN);
}

/**
 * The public address of the site, for absolute links in Open Graph and canonical tags.
 * On Vercel it falls back to the production domain Vercel provides.
 */
export function resolveSiteUrl(env: Env): string {
  const vercelDomain = env["VERCEL_PROJECT_PRODUCTION_URL"];
  const fallback = vercelDomain ? { SITE_URL: `https://${vercelDomain}` } : {};
  return resolveOrigin({ ...fallback, ...env }, "SITE_URL", LOCAL_SITE_URL);
}
