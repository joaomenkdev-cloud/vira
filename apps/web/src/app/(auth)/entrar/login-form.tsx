"use client";

import type { OAuthLoginError, OAuthProviderName } from "@vira/shared";
import { Alert, Button, Input, PasswordInput } from "@vira/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent, type ReactNode } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { validateCurrentPassword, validateEmail } from "@/components/forms/validation";
import { login } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { useSession } from "@/lib/session/session-provider";

const FIELDS = ["email", "password"] as const;

const PROVIDER_NAMES: Record<OAuthProviderName, string> = {
  google: "Google",
  github: "GitHub",
};

const OAUTH_ERRORS: Record<OAuthLoginError, string> = {
  "oauth-denied":
    "O login social foi cancelado. Você pode tentar de novo ou entrar com e-mail e senha.",
  "oauth-failed":
    "Não foi possível concluir o login social. Tente de novo; se continuar, entre com e-mail e senha.",
  "oauth-email-not-verified":
    "Sua conta nesse provedor não tem um e-mail verificado. Verifique o e-mail lá ou entre com e-mail e senha.",
};

interface Problem {
  variant: "danger" | "warning";
  title: string;
  body?: ReactNode;
}

export interface LoginFormProps {
  /** Where to go after signing in: a path of this site, already checked. */
  next: string;
  oauthError: OAuthLoginError | undefined;
  providers: readonly OAuthProviderName[];
}

export function LoginForm({ next, oauthError, providers }: LoginFormProps) {
  const router = useRouter();
  const session = useSession();
  const form = useForm({ email: validateEmail, password: validateCurrentPassword });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(
    oauthError ? { variant: "danger", title: OAUTH_ERRORS[oauthError] } : null,
  );

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    if (values === null) {
      setProblem(null);
      return;
    }
    setSubmitting(true);
    setProblem(null);
    try {
      await login({ email: values.email, password: values.password });
      await session.reload();
      router.replace(next);
    } catch (error) {
      setSubmitting(false);
      setProblem(problemFor(error));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {problem ? (
        <Alert variant={problem.variant} title={problem.title}>
          {problem.body}
        </Alert>
      ) : null}

      {/* POST: a submit before the script loads must not put the password in the address. */}
      <form
        method="post"
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
        <div className="flex flex-col gap-2">
          <PasswordInput
            {...form.field("password")}
            label="Senha"
            autoComplete="current-password"
          />
          <Link
            href="/esqueci-a-senha"
            className="inline-flex min-h-11 items-center self-start text-body-sm text-ink underline underline-offset-4 hover:text-accent-ink"
          >
            Esqueci minha senha
          </Link>
        </div>
        <Button
          type="submit"
          size="lg"
          loading={submitting}
          loadingLabel="Entrando…"
          className="w-full"
        >
          Entrar
        </Button>
      </form>

      {providers.length > 0 ? (
        <section aria-labelledby="login-social" className="flex flex-col gap-3">
          <h2 id="login-social" className="flex items-center gap-4 text-body-sm text-ink-muted">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            ou continue com
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </h2>
          {providers.map((provider) => (
            <Button key={provider} asChild variant="secondary" size="lg" className="w-full">
              {/* A full navigation: the API answers with a redirect to the provider. */}
              <a href={`/api/v1/auth/oauth/${provider}?next=${encodeURIComponent(next)}`}>
                Continuar com {PROVIDER_NAMES[provider]}
              </a>
            </Button>
          ))}
        </section>
      ) : null}

      <p className="text-body text-ink-muted">
        Ainda não tem conta?{" "}
        <Link
          href="/cadastro"
          className="text-ink underline underline-offset-4 hover:text-accent-ink"
        >
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}

function problemFor(error: unknown): Problem {
  if (error instanceof ApiError) {
    if (error.code === "invalid-credentials") {
      return {
        variant: "danger",
        title: "E-mail ou senha incorretos.",
        body: "Confira os dados e tente de novo. Depois de algumas tentativas erradas, a conta fica bloqueada por alguns minutos.",
      };
    }
    if (error.code === "email-not-verified") {
      return {
        variant: "warning",
        title: "Confirme seu e-mail para entrar.",
        body: (
          <>
            Abra o link que enviamos quando você se cadastrou. Não encontrou o e-mail? Peça um link
            em{" "}
            <Link href="/esqueci-a-senha" className="underline underline-offset-4">
              Esqueci minha senha
            </Link>
            : ele também confirma seu e-mail.
          </>
        ),
      };
    }
  }
  return { variant: "danger", title: messageFor(error) };
}
