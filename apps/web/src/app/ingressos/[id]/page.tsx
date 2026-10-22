import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resourceIdSchema } from "@vira/shared";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { TicketView } from "./ticket-view";

export const metadata: Metadata = { title: "Ingresso", robots: { index: false } };

/**
 * One ticket with its QR Code. It comes from the API in the browser, with the session
 * cookies, and is never cached: the QR token is the ticket itself.
 */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) {
    redirect(`/entrar?next=${encodeURIComponent(`/ingressos/${id}`)}`);
  }
  return (
    <div className="mx-auto w-full max-w-page px-4 pt-6 pb-20 sm:px-6 md:pt-10 md:pb-28 lg:px-8 print:p-0">
      <TicketView ticketId={id} />
    </div>
  );
}
