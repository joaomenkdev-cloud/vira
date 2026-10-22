"use client";

import type { Account } from "@vira/shared";
import { Alert, Button, PasswordInput } from "@vira/ui";
import { useState, type SubmitEvent } from "react";

import { apiFieldErrors } from "@/components/forms/api-field-errors";
import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import {
  NEW_PASSWORD_HINT,
  validateCurrentPassword,
  validateNewPassword,
} from "@/components/forms/validation";
import { changePassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";

import { AccountSection } from "./account-section";
import { NoPasswordNotice } from "./no-password-notice";

const FIELDS = ["currentPassword", "newPassword"] as const;

export function PasswordSection({ account }: { account: Account }) {
  const form = useForm({
    currentPassword: validateCurrentPassword,
    newPassword: validateNewPassword,
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const target = event.currentTarget;
    const values = form.submit(event);
    setResult(null);
    if (values === null) return;
    setSubmitting(true);
    try {
      await changePassword(values);
      target.reset();
      setResult({
        ok: true,
        message: "Senha alterada. Encerramos as sessões dos outros dispositivos; esta continua.",
      });
    } catch (error) {
      if (error instanceof ApiError && error.code === "incorrect-password") {
        form.setFieldError("currentPassword", "Senha incorreta.");
        return;
      }
      const breached = apiFieldErrors(error, FIELDS).newPassword;
      if (breached === undefined) setResult({ ok: false, message: messageFor(error) });
      else form.setFieldError("newPassword", breached);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountSection title="Senha">
      {account.hasPassword ? (
        <form
          method="post"
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-6"
        >
          <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
          {result ? (
            <Alert variant={result.ok ? "success" : "danger"} title={result.message} />
          ) : null}
          <PasswordInput
            {...form.field("currentPassword")}
            label="Senha atual"
            autoComplete="current-password"
          />
          <PasswordInput
            {...form.field("newPassword")}
            label="Senha nova"
            autoComplete="new-password"
            hint={NEW_PASSWORD_HINT}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={submitting}
            loadingLabel="Salvando…"
            className="self-start"
          >
            Trocar senha
          </Button>
        </form>
      ) : (
        <NoPasswordNotice action="ter uma senha" />
      )}
    </AccountSection>
  );
}
