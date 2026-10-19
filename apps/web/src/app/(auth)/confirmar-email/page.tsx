import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { ConfirmEmailChange } from "./confirm-email-change";

export const metadata: Metadata = { title: "Confirmar e-mail novo" };

export default function ConfirmEmailChangePage() {
  return (
    <AuthShell title="Confirmar e-mail novo">
      <ConfirmEmailChange />
    </AuthShell>
  );
}
