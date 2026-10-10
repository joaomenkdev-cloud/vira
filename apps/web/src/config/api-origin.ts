const LOCAL_API_ORIGIN = "http://127.0.0.1:3000";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Where `/api/v1/*` is proxied to. The browser only ever talks to the web origin,
 * so the session cookies stay first-party (ADR-0005).
 *
 * The value is read when the app is built. Outside deployments it defaults to the
 * local API; on Vercel it must be set, and it must be https unless it points at
 * the loopback interface. The error never repeats the value, which may hold a
 * host that is not public.
 */
export function resolveApiOrigin(env: Env): string {
  const deployed = env["VERCEL"] !== undefined;
  const raw = env["API_ORIGIN"] ?? (deployed ? undefined : LOCAL_API_ORIGIN);
  if (raw === undefined || raw === "") {
    throw new Error("API_ORIGIN is required in deployments.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API_ORIGIN must be a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("API_ORIGIN must use http or https.");
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("API_ORIGIN must use https unless it points at the loopback interface.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("API_ORIGIN must not contain credentials.");
  }
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error("API_ORIGIN must be an origin only: no path, query or fragment.");
  }
  return url.origin;
}
