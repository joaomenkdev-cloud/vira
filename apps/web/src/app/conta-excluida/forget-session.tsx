"use client";

import { useEffect } from "react";

import { useSession } from "@/lib/session/session-provider";

/** The API already cleared the cookies; the page's idea of who is signed in follows. */
export function ForgetSession() {
  const session = useSession();
  const signedIn = session.state.status !== "anonymous";
  const { signedOut } = session;
  useEffect(() => {
    if (signedIn) signedOut();
  }, [signedIn, signedOut]);
  return null;
}
