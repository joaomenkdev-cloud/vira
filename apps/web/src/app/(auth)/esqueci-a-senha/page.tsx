import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta e enviaremos um link para você criar uma senha nova."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
