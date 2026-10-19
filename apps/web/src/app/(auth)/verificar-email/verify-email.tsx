"use client";

import type { PublicUser } from "@vira/shared";
import { Button } from "@vira/ui";
import Link from "next/link";
import { useCallback } from "react";

import { ResultPanel } from "@/components/auth/result-panel";
import { TokenAction } from "@/components/auth/token-page";
import { verifyEmail } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { useSession } from "@/lib/session/session-provider";

const NEW_LINK_HINT = (
  <>
    Se você ainda não confirmou, peça um link em{" "}
    <Link href="/esqueci-a-senha" className="underline underline-offset-4">
      Esqueci minha senha
    </Link>
    : ele também confirma seu e-mail.
  </>
);

export function VerifyEmail() {
  const session = useSession();
  const { reload } = session;

  // Confirming the e-mail opens the session (docs/API.md): the header learns about it.
  const action = useCallback(
    async (token: string): Promise<PublicUser> => {
      const user = await verifyEmail(token);
      await reload();
      return user;
    },
    [reload],
  );

  return (
    <TokenAction
      name="verify-email"
      action={action}
      missing={
        <ResultPanel variant="warning" title="Este link está incompleto.">
          Abra de novo o link do e-mail, sem cortar nenhuma parte dele. {NEW_LINK_HINT}
        </ResultPanel>
      }
    >
      {(outcome) =>
        outcome.ok ? (
          <ResultPanel
            variant="success"
            title="E-mail confirmado."
            actions={
              <>
                <Button asChild>
                  <Link href="/">Explorar eventos</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/conta">Minha conta</Link>
                </Button>
              </>
            }
          >
            Boas-vindas ao Vira, {outcome.value.name}. Você já entrou na sua conta.
          </ResultPanel>
        ) : outcome.error instanceof ApiError && outcome.error.code === "token-expired" ? (
          <ResultPanel
            variant="warning"
            title="Este link expirou ou já foi usado."
            actions={
              <Button asChild variant="secondary">
                <Link href="/entrar">Entrar</Link>
              </Button>
            }
          >
            Se você já confirmou seu e-mail, é só entrar. {NEW_LINK_HINT}
          </ResultPanel>
        ) : (
          <ResultPanel variant="danger" title={messageFor(outcome.error)}>
            Abra o link do e-mail de novo para tentar outra vez.
          </ResultPanel>
        )
      }
    </TokenAction>
  );
}
