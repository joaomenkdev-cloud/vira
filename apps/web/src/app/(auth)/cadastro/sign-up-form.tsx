"use client";

import { Alert, Button, Input, PasswordInput } from "@vira/ui";
import Link from "next/link";
import { useState, type SubmitEvent } from "react";

import { ResultPanel } from "@/components/auth/result-panel";
import { apiFieldErrors } from "@/components/forms/api-field-errors";
import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import {
  NEW_PASSWORD_HINT,
  validateEmail,
  validateName,
  validateNewPassword,
} from "@/components/forms/validation";
import { register } from "@/lib/api/auth";
import { messageFor } from "@/lib/api/messages";

const FIELDS = ["name", "email", "password"] as const;

export function SignUpForm() {
  const form = useForm({ name: validateName, email: validateEmail, password: validateNewPassword });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    setProblem(null);
    if (values === null) return;
    setSubmitting(true);
    try {
      await register({ name: values.name, email: values.email, password: values.password });
      setSentTo(values.email.trim().toLowerCase());
    } catch (error) {
      const fieldErrors = apiFieldErrors(error, FIELDS);
      const field = FIELDS.find((name) => fieldErrors[name] !== undefined);
      if (field === undefined) setProblem(messageFor(error));
      else form.setFieldError(field, fieldErrors[field] ?? "");
    } finally {
      setSubmitting(false);
    }
  }

  // The same answer whether or not the e-mail already has an account (docs/API.md):
  // the difference only shows in that inbox.
  if (sentTo !== null) {
    return (
      <ResultPanel
        variant="success"
        title="Confira seu e-mail"
        actions={
          <Button asChild variant="secondary">
            <Link href="/entrar">Ir para o login</Link>
          </Button>
        }
      >
        Enviamos uma mensagem para <strong className="font-semibold">{sentTo}</strong>. Abra o link
        dela para confirmar seu e-mail e entrar; ele vale por 24 horas. Não chegou? Veja a caixa de
        spam.
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
        <Input {...form.field("name")} label="Nome" autoComplete="name" maxLength={120} />
        <Input
          {...form.field("email")}
          type="email"
          label="E-mail"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
        <PasswordInput
          {...form.field("password")}
          label="Senha"
          autoComplete="new-password"
          hint={NEW_PASSWORD_HINT}
        />
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingLabel="Criando conta…"
          className="w-full"
        >
          Criar conta
        </Button>
        <p className="text-body-sm text-ink-muted">
          Ao criar a conta, você declara ter lido a{" "}
          <Link
            href="/privacidade"
            className="text-ink underline underline-offset-4 hover:text-accent-ink"
          >
            política de privacidade
          </Link>
          .
        </p>
      </form>

      <p className="text-body text-ink-muted">
        Já tem conta?{" "}
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
