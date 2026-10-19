"use client";

import type { Account } from "@vira/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getAccount } from "../api/auth";
import { api } from "../api/browser";
import { ApiError } from "../api/errors";
import { clearSessionHint, setSessionHint } from "./hint";

export type SessionState =
  /** Asking the API who is signed in. */
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; account: Account }
  /** The API could not be reached: whether there is a session is unknown. */
  | { status: "unavailable" };

export interface Session {
  state: SessionState;
  /** Asks the API again (after signing in, or to retry when it was unavailable). */
  reload: () => Promise<Account | null>;
  /** Replaces the account after an edit the API answered with. */
  update: (account: Account) => void;
  /** Forgets the session after a logout. */
  signedOut: () => void;
}

const SessionContext = createContext<Session | null>(null);

export interface SessionProviderProps {
  /** The browser carries the session hint: ask the API instead of assuming a visitor. */
  hinted: boolean;
  children: ReactNode;
}

/**
 * Who is signed in, for every client component of the page. The session cookies are
 * `HttpOnly`, so the answer comes from `GET /me`; it is only asked when the session
 * hint says there may be a session (see `hint.ts`).
 */
export function SessionProvider({ hinted, children }: SessionProviderProps) {
  const [state, setState] = useState<SessionState>(
    hinted ? { status: "loading" } : { status: "anonymous" },
  );

  const reload = useCallback(async (): Promise<Account | null> => {
    const next = await askTheApi();
    setState(next);
    return next.status === "authenticated" ? next.account : null;
  }, []);

  useEffect(() => {
    if (hinted) void askTheApi().then(setState);
  }, [hinted]);

  // A refresh that fails anywhere on the page means the session is over.
  useEffect(
    () =>
      api.onSessionLost(() => {
        clearSessionHint();
        setState({ status: "anonymous" });
      }),
    [],
  );

  const session = useMemo<Session>(
    () => ({
      state,
      reload,
      update: (account) => {
        setState({ status: "authenticated", account });
      },
      signedOut: () => {
        clearSessionHint();
        setState({ status: "anonymous" });
      },
    }),
    [state, reload],
  );

  return <SessionContext value={session}>{children}</SessionContext>;
}

/** Who the API says is signed in. Keeps the session hint in step with the answer. */
async function askTheApi(): Promise<SessionState> {
  try {
    const account = await getAccount();
    setSessionHint();
    return { status: "authenticated", account };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearSessionHint();
      return { status: "anonymous" };
    }
    return { status: "unavailable" };
  }
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession must be used inside SessionProvider.");
  return session;
}
