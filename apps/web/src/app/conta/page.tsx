import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_HINT_COOKIE } from "@/lib/session/hint";

import { AccountView } from "./account-view";

export const metadata: Metadata = { title: "Minha conta", robots: { index: false } };

export default async function AccountPage() {
  // Without the hint there is certainly no session: straight to the login. With it,
  // the page asks the API, and goes to the login if the session turns out to be over.
  if (!(await cookies()).has(SESSION_HINT_COOKIE)) redirect("/entrar?next=/conta");

  return (
    <div className="mx-auto w-full max-w-reading px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <h1 className="text-h1-sm md:text-h1">Minha conta</h1>
      <AccountView />
    </div>
  );
}
