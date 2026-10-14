import type { z } from "zod";

import { OAuthProviderError } from "../../application/ports/oauth-provider.js";

/** A provider that does not answer within this long fails the login (docs/SECURITY_MODEL.md, API10). */
export const PROVIDER_TIMEOUT_MS = 5_000;

/** Far above any answer we expect (tokens, profiles, key sets). */
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * One request to a provider, answered with JSON that must match `schema`. No retries:
 * an authorization code works once, so a second token request could only fail, and a
 * person can simply try again. Redirects are refused; every endpoint is final.
 * Error messages carry the endpoint and status only, never the body (it may hold tokens).
 */
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OAuthProviderError(`${url} did not answer`, { cause: error });
  }

  const endpoint = `${init.method ?? "GET"} ${new URL(url).pathname}`;
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new OAuthProviderError(`${endpoint}: response too large`);
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new OAuthProviderError(`${endpoint}: response too large`);
  }
  if (!response.ok) throw new OAuthProviderError(`${endpoint} answered ${response.status}`);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new OAuthProviderError(`${endpoint}: response is not JSON`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new OAuthProviderError(`${endpoint}: unexpected response`);
  return parsed.data;
}

/** `application/x-www-form-urlencoded` body, as both token endpoints expect. */
export function formBody(fields: Readonly<Record<string, string>>): URLSearchParams {
  return new URLSearchParams(fields);
}
