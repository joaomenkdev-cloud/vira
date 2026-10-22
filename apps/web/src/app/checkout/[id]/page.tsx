import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resourceIdSchema } from "@vira/shared";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false } };

interface CheckoutPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The checkout of one reservation. The order comes from the API in the browser, with the
 * session cookies; without a session hint the visitor goes straight to the login.
 */
export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) {
    redirect(`/entrar?next=${encodeURIComponent(`/checkout/${id}`)}`);
  }
  const { retomada } = await searchParams;

  return (
    <div className="mx-auto w-full max-w-checkout px-4 pt-6 pb-20 sm:px-6 md:pt-10 md:pb-28">
      <CheckoutView orderId={id} resumed={retomada === "1"} />
    </div>
  );
}
