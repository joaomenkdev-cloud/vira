"use client";

import type { Account } from "@vira/shared";
import { Alert, Button, Input } from "@vira/ui";
import { useState, type SubmitEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { validateName } from "@/components/forms/validation";
import { updateProfile } from "@/lib/api/auth";
import { messageFor } from "@/lib/api/messages";
import { useSession } from "@/lib/session/session-provider";

import { AccountSection } from "./account-section";

const FIELDS = ["name"] as const;

export function ProfileSection({ account }: { account: Account }) {
  const session = useSession();
  const form = useForm({ name: validateName });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    setResult(null);
    if (values === null) return;
    setSubmitting(true);
    try {
      session.update(await updateProfile({ name: values.name }));
      setResult({ ok: true, message: "Nome atualizado." });
    } catch (error) {
      setResult({ ok: false, message: messageFor(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AccountSection title="Perfil" description="O nome que aparece nos seus ingressos.">
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
          {...form.field("name")}
          label="Nome"
          autoComplete="name"
          maxLength={120}
          defaultValue={account.name}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={submitting}
          loadingLabel="Salvando…"
          className="self-start"
        >
          Salvar nome
        </Button>
      </form>
    </AccountSection>
  );
}
