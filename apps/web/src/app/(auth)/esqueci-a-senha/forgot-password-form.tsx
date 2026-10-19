"use client";

import { Alert, Button, Input } from "@vira/ui";
import Link from "next/link";
import { useState, type SubmitEvent } from "react";

import { ResultPanel } from "@/components/auth/result-panel";
import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { validateEmail } from "@/components/forms/validation";
import { forgotPassword } from "@/lib/api/auth";
import { messageFor } from "@/lib/api/messages";

const FIELDS = ["email"] as const;

export function ForgotPasswordForm() {
  const form = useForm({ email: validateEmail });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    setProblem(null);
    if (values === null) return;
    setSubmitting(true);
    try {
      await forgotPassword(values.email);
      setSentTo(values.email.trim().toLowerCase());
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  // Worded so that it never says whether the address has an account (docs/API.md).
  if (sentTo !== null) {
    return (
      <ResultPanel
        variant="success"
        title="Confira seu e-mail"
        actions={
          <Button asChild variant="secondary">
            <Link href="/entrar">Voltar para o login</Link>
          </Button>
        }
      >
        Se houver uma conta com <strong className="font-semibold">{sentTo}</strong>, enviamos um
        link para criar uma senha nova. Ele vale por 30 minutos e também confirma seu e-mail. Não
        chegou? Veja a caixa de spam.
      </ResultPanel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {problem ? <Alert variant="danger" title={problem} /> : null}

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-6"
      >
        <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
        <Input
          {...form.field("email")}
          type="email"
          label="E-mail"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingLabel="Enviando…"
          className="w-full"
        >
          Enviar link
        </Button>
      </form>

      <p className="text-body text-ink-muted">
        Lembrou a senha?{" "}
        <Link
          href="/entrar"
          className="text-ink underline underline-offset-4 hover:text-accent-ink"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}
