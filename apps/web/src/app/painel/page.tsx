import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { STATUS_FILTERS } from "./status-filters";
import { OrganizerEventsView } from "./organizer-events-view";

export const metadata: Metadata = { title: "Meus eventos", robots: { index: false } };

/**
 * The organizer's panel: every event of the account, newest first, by status. The list
 * comes from the API in the browser (with the session cookies), like the account page.
 */
export default async function OrganizerPanelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) redirect("/entrar?next=/painel");

  const { status } = await searchParams;
  const filter = STATUS_FILTERS.find((item) => item.param === status) ?? STATUS_FILTERS[0];

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28 lg:px-8">
      <OrganizerEventsView filter={filter} />
    </div>
  );
}
