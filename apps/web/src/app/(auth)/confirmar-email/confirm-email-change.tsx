"use client";

import { Button } from "@vira/ui";
import Link from "next/link";
import { useCallback } from "react";

import { ResultPanel } from "@/components/auth/result-panel";
import { TokenAction } from "@/components/auth/token-page";
import { confirmEmailChange } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { hasSessionHint } from "@/lib/session/hint";
import { useSession } from "@/lib/session/session-provider";

const ACCOUNT_LINK = (
  <Button asChild variant="secondary">
    <Link href="/conta">Minha conta</Link>
  </Button>
);

export function ConfirmEmailChange() {
  const session = useSession();
  const { reload } = session;

  const action = useCallback(
    async (token: string): Promise<void> => {
      await confirmEmailChange(token);
      // The account page and the header show the new address. The link may be opened
      // in a browser without a session: then there is nothing to reload.
      if (hasSessionHint()) await reload();
    },
    [reload],
  );

  return (
    <TokenAction
      name="confirm-email-change"
      action={action}
      missing={
        <ResultPanel variant="warning" title="Este link está incompleto." actions={ACCOUNT_LINK}>
          Abra de novo o link do e-mail, sem cortar nenhuma parte dele, ou peça a troca de novo na
          sua conta.
        </ResultPanel>
      }
    >
      {(outcome) =>
        outcome.ok ? (
          <ResultPanel variant="success" title="E-mail alterado." actions={ACCOUNT_LINK}>
            Daqui em diante, use o endereço novo para entrar e para receber seus ingressos.
          </ResultPanel>
        ) : outcome.error instanceof ApiError && outcome.error.code === "token-expired" ? (
          <ResultPanel
            variant="warning"
            title="Este link expirou ou já foi usado."
            actions={ACCOUNT_LINK}
          >
            Os links de troca de e-mail valem por 24 horas e só uma vez. Se o e-mail ainda não
            mudou, peça a troca de novo na sua conta.
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
