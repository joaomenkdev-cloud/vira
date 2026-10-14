"use client";

import type { Account } from "@vira/shared";
import { Alert, Button, Input, PasswordInput } from "@vira/ui";
import { useState, type SubmitEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { validateCurrentPassword, validateEmail } from "@/components/forms/validation";
import { changeEmail } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";

import { AccountSection } from "./account-section";
import { NoPasswordNotice } from "./no-password-notice";

const FIELDS = ["email", "currentPassword"] as const;

export function EmailSection({ account }: { account: Account }) {
  const form = useForm({ email: validateEmail, currentPassword: validateCurrentPassword });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const target = event.currentTarget;
    const values = form.submit(event);
    setResult(null);
    if (values === null) return;
    const email = values.email.trim().toLowerCase();
    if (email === account.email) {
      form.setFieldError("email", "Este já é o e-mail da sua conta. Informe outro.");
      return;
    }
    setSubmitting(true);
    try {
      await changeEmail({ email, currentPassword: values.currentPassword });
      target.reset();
      setResult({
        ok: true,
        message: `Enviamos um link para ${email}. Seu e-mail muda quando você abrir o link, que vale por 24 horas.`,
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "incorrect-password") {
        form.setFieldError("currentPassword", "Senha incorreta.");
      } else {
        setResult({ ok: false, message: messageFor(error) });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountSection
      title="E-mail"
      description={
        <>
          Você entra e recebe seus ingressos em{" "}
          <strong className="font-semibold text-ink">{account.email}</strong>.
        </>
      }
    >
      {account.hasPassword ? (
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-6"
        >
          <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
          {result ? (
            <Alert variant={result.ok ? "success" : "danger"} title={result.message} />
          ) : null}
          <Input
            {...form.field("email")}
            type="email"
            label="E-mail novo"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
          />
          <PasswordInput
            {...form.field("currentPassword")}
            label="Senha atual"
            autoComplete="current-password"
            hint="Para confirmar que é você."
          />
          <Button
            type="submit"
            variant="secondary"
            loading={submitting}
            loadingLabel="Enviando…"
            className="self-start"
          >
            Trocar e-mail
          </Button>
        </form>
      ) : (
        <NoPasswordNotice action="trocar o e-mail" />
      )}
    </AccountSection>
  );
}
