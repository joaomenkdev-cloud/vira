"use client";

import { Skeleton } from "@vira/ui";
import { useEffect, useState, type ReactNode } from "react";

import { once, useFragmentToken } from "@/lib/fragment-token";

export type TokenOutcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface TokenActionProps<T> {
  /** What the link does with its token. Runs once per token. */
  action: (token: string) => Promise<T>;
  /** A key that tells this page's action apart from another page's. */
  name: string;
  /** The link came without a usable token. */
  missing: ReactNode;
  children: (outcome: TokenOutcome<T>) => ReactNode;
}

/**
 * A page opened from an e-mail link that acts on its own: it reads the token from the
 * fragment, sends it once and shows how it went.
 */
export function TokenAction<T>({ action, name, missing, children }: TokenActionProps<T>) {
  const token = useFragmentToken();
  const [outcome, setOutcome] = useState<TokenOutcome<T> | null>(null);

  useEffect(() => {
    if (typeof token !== "string") return;
    let active = true;
    once(`${name}:${token}`, () => action(token)).then(
      (value) => {
        if (active) setOutcome({ ok: true, value });
      },
      (error: unknown) => {
        if (active) setOutcome({ ok: false, error });
      },
    );
    return () => {
      active = false;
    };
  }, [token, name, action]);

  if (token === null) return missing;
  if (outcome === null) return <Pending />;
  return children(outcome);
}

/** While the token is read and sent: the shape of the result to come. */
export function Pending() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p className="sr-only" role="status">
        Conferindo o link…
      </p>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-11 w-40" />
    </div>
  );
}
