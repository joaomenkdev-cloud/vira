import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { NewEventView } from "./new-event-view";

export const metadata: Metadata = { title: "Criar evento", robots: { index: false } };

export default async function NewEventPage() {
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) {
    redirect(`/entrar?next=${encodeURIComponent("/painel/eventos/novo")}`);
  }

  return (
    <div className="mx-auto w-full max-w-reading px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <NewEventView />
    </div>
  );
}
