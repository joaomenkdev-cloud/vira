import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Confirmar e-mail" };

export default function VerifyEmailPage() {
  return (
    <AuthShell title="Confirmar e-mail">
      <VerifyEmail />
    </AuthShell>
  );
}
