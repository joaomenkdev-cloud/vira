import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Criar senha nova" };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Criar senha nova">
      <ResetPasswordForm />
    </AuthShell>
  );
}
