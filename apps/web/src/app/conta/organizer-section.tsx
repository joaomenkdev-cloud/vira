"use client";

import type { Account } from "@vira/shared";
import { Alert, Button, Input } from "@vira/ui";
import { useState, type SubmitEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { validateOrganizerName } from "@/components/forms/validation";
import { becomeOrganizer } from "@/lib/api/auth";
import { messageFor } from "@/lib/api/messages";
import { useSession } from "@/lib/session/session-provider";

import { AccountSection } from "./account-section";

const FIELDS = ["displayName"] as const;

export function OrganizerSection({ account }: { account: Account }) {
  const session = useSession();
  const form = useForm({ displayName: validateOrganizerName });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    setProblem(null);
    if (values === null) return;
    setSubmitting(true);
    try {
      await becomeOrganizer({ displayName: values.displayName });
      await session.reload();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (account.organizer) {
    return (
      <AccountSection title="Organizador">
        <Alert
          variant="success"
          title={`Você organiza eventos como ${account.organizer.displayName}.`}
        >
          O painel para criar e publicar eventos ainda está em construção.
        </Alert>
      </AccountSection>
    );
  }

  return (
    <AccountSection
      title="Organizador"
      description="Quer vender ingressos para os seus eventos? Escolha o nome que o público vai ver."
    >
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-6"
      >
        <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
        {problem ? <Alert variant="danger" title={problem} /> : null}
        <Input
          {...form.field("displayName")}
          label="Nome de organizador"
          placeholder="Coletivo Vira"
          maxLength={80}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={submitting}
          loadingLabel="Criando perfil…"
          className="self-start"
        >
          Quero organizar eventos
        </Button>
      </form>
    </AccountSection>
  );
}
