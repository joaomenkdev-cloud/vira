import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resourceIdSchema } from "@vira/shared";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { ConfirmationView } from "./confirmation-view";

export const metadata: Metadata = { title: "Confirmação do pedido", robots: { index: false } };

interface ConfirmationPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * After paying: waits for the webhook to mark the order as paid, then shows the tickets.
 * Stripe also returns here after a bank's own verification, with `redirect_status`.
 */
export default async function ConfirmationPage({ params, searchParams }: ConfirmationPageProps) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) {
    redirect(`/entrar?next=${encodeURIComponent(`/checkout/${id}/confirmacao`)}`);
  }
  const { redirect_status: redirectStatus } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-checkout px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <ConfirmationView orderId={id} paymentFailed={redirectStatus === "failed"} />
    </div>
  );
}
