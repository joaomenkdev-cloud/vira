import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { CheckinView } from "./checkin-view";

export const metadata: Metadata = { title: "Check-in", robots: { index: false } };

/** The door of one of the organizer's events: the camera, the typed code and the count. */
export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/painel/eventos/${encodeURIComponent(id)}/check-in`;
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) {
    redirect(`/entrar?next=${encodeURIComponent(path)}`);
  }

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-6 pb-20 sm:px-6 md:pt-10 md:pb-28">
      <CheckinView id={id} />
    </div>
  );
}
