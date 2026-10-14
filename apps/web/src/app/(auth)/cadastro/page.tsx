import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";

import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Criar conta"
      description="Com uma conta, você compra ingressos e os encontra sempre no mesmo lugar."
    >
      <SignUpForm />
    </AuthShell>
  );
}
