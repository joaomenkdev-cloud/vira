import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { EventEditor } from "./event-editor";

export const metadata: Metadata = { title: "Editar evento", robots: { index: false } };

/** One event of the organizer: its details, picture, ticket types and publication. */
export default async function OrganizerEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/painel/eventos/${encodeURIComponent(id)}`;
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) {
    redirect(`/entrar?next=${encodeURIComponent(path)}`);
  }

  return (
    <div className="mx-auto w-full max-w-reading px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <EventEditor id={id} />
    </div>
  );
}
