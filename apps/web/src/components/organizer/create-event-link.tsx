"use client";

import { Button } from "@vira/ui";
import Link from "next/link";

import { useSession } from "@/lib/session/session-provider";

/**
 * "Criar um evento", for organizers only (docs/DESIGN.md, 3.9: the empty home). The
 * page is drawn on the server for everyone; who is signed in is known in the browser.
 */
export function CreateEventLink() {
  const { state } = useSession();
  if (state.status !== "authenticated" || !state.account.organizer) return null;
  return (
    <Button asChild variant="secondary">
      <Link href="/painel/eventos/novo">Criar um evento</Link>
    </Button>
  );
}
