"use client";

import { Alert, Button, PasswordInput } from "@vira/ui";
import Link from "next/link";
import { useState, type SubmitEvent } from "react";

import { Pending } from "@/components/auth/token-page";
import { ResultPanel } from "@/components/auth/result-panel";
import { apiFieldErrors } from "@/components/forms/api-field-errors";
import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { NEW_PASSWORD_HINT, validateNewPassword } from "@/components/forms/validation";
import { resetPassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { useFragmentToken } from "@/lib/fragment-token";
import { useSession } from "@/lib/session/session-provider";

const FIELDS = ["password"] as const;

type Outcome = "done" | "expired";

const NEW_LINK = (
  <Button asChild variant="secondary">
    <Link href="/esqueci-a-senha">Pedir um link novo</Link>
  </Button>
);

export function ResetPasswordForm() {
  const token = useFragmentToken();
  const session = useSession();
  const form = useForm({ password: validateNewPassword });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    setProblem(null);
    if (values === null || typeof token !== "string") return;
    setSubmitting(true);
    try {
      await resetPassword({ token, password: values.password });
      // Every session was revoked, the one of this browser included.
      session.signedOut();
      setOutcome("done");
    } catch (error) {
      if (error instanceof ApiError && error.code === "token-expired") {
        setOutcome("expired");
        return;
      }
      // A breached password does not spend the link: another one can be tried.
      const fieldError = apiFieldErrors(error, FIELDS).password;
      if (fieldError === undefined) setProblem(messageFor(error));
      else form.setFieldError("password", fieldError);
    } finally {
      setSubmitting(false);
    }
  }

  if (token === undefined) return <Pending />;
  if (token === null) {
    return (
      <ResultPanel variant="warning" title="Este link está incompleto." actions={NEW_LINK}>
        Abra de novo o link do e-mail, sem cortar nenhuma parte dele, ou peça um link novo.
      </ResultPanel>
    );
  }
  if (outcome === "expired") {
    return (
      <ResultPanel variant="warning" title="Este link expirou ou já foi usado." actions={NEW_LINK}>
        Os links para criar senha valem por 30 minutos e só uma vez. Peça um novo para continuar.
      </ResultPanel>
    );
  }
  if (outcome === "done") {
    return (
      <ResultPanel
        variant="success"
        title="Senha nova criada."
        actions={
          <Button asChild>
            <Link href="/entrar">Entrar</Link>
          </Button>
        }
      >
        Por segurança, encerramos todas as sessões da sua conta. Entre de novo com a senha nova.
      </ResultPanel>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-body text-ink-muted">
        Escolha a senha que você vai usar para entrar daqui em diante.
      </p>
      {problem ? <Alert variant="danger" title={problem} /> : null}

      <form
        method="post"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-6"
      >
        <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
        <PasswordInput
          {...form.field("password")}
          label="Senha nova"
          autoComplete="new-password"
          hint={NEW_PASSWORD_HINT}
        />
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingLabel="Salvando…"
          className="w-full"
        >
          Salvar senha nova
        </Button>
      </form>
    </div>
  );
}
