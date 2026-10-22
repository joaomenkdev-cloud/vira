import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { FilterChip } from "@/components/filter-chip";
import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { TicketsView } from "./tickets-view";

export const metadata: Metadata = { title: "Meus ingressos", robots: { index: false } };

/**
 * The buyer's tickets: the coming events first, the past ones a chip away. The list
 * comes from the API in the browser, with the session cookies.
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) redirect("/entrar?next=/ingressos");
  const past = (await searchParams)["quando"] === "passados";

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28 lg:px-8">
      <h1 className="text-h1-sm md:text-h1">Meus ingressos</h1>
      <nav aria-label="Período" className="mt-6 flex gap-2">
        <FilterChip href="/ingressos" selected={!past}>
          Próximos
        </FilterChip>
        <FilterChip href="/ingressos?quando=passados" selected={past}>
          Passados
        </FilterChip>
      </nav>
      <TicketsView key={past ? "past" : "upcoming"} when={past ? "past" : "upcoming"} />
    </div>
  );
}
