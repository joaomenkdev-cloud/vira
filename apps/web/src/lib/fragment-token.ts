"use client";

import { verificationTokenSchema } from "@vira/shared";
import { useSyncExternalStore } from "react";

/**
 * E-mail links carry their token in the fragment (`/verificar-email#token=...`), so it
 * never reaches a server log or a `Referer` (docs/API.md). The page reads it once, then
 * removes it from the address bar and the history: a token left there could be copied
 * along with the URL.
 */

const captured = new Map<string, string | null>();

/** `null` when the fragment has no well-formed token. */
export function parseFragmentToken(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get("token");
  return value !== null && verificationTokenSchema.safeParse(value).success ? value : null;
}

function readOnce(): string | null {
  const path = location.pathname;
  if (!captured.has(path)) {
    captured.set(path, parseFragmentToken(location.hash));
    if (location.hash !== "") {
      history.replaceState(history.state, "", `${location.pathname}${location.search}`);
    }
  }
  return captured.get(path) ?? null;
}

const noSubscription = () => () => undefined;

/** The token of this page's link: `undefined` while rendering on the server. */
export function useFragmentToken(): string | null | undefined {
  return useSyncExternalStore(noSubscription, readOnce, () => undefined);
}

/**
 * A single-use token must be sent once, even when React runs an effect twice
 * (development) or the page is drawn again: the first call's promise is shared.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending === undefined) {
    pending = run();
    inFlight.set(key, pending);
  }
  return pending;
}
