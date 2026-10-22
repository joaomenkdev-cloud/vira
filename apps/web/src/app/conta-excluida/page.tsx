import { Button } from "@vira/ui";
import type { Metadata } from "next";
import Link from "next/link";

import { ForgetSession } from "./forget-session";

export const metadata: Metadata = { title: "Conta excluída", robots: { index: false } };

/** Where the account page leads once the account is gone. */
export default function AccountDeletedPage() {
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-6 px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <ForgetSession />
      <h1 className="text-h1-sm md:text-h1">Sua conta foi excluída</h1>
      <p className="text-body-lg text-ink-muted">
        Seu nome e seu e-mail foram apagados de tudo o que a Vira guarda, e você saiu da conta em
        todos os dispositivos. Os registros de pagamento continuam, sem dizer de quem eram.
      </p>
      <p className="text-body text-ink-muted">
        Se quiser voltar um dia, é só criar uma conta nova.{" "}
        <Link href="/privacidade" className="text-ink underline underline-offset-4">
          Como a Vira trata seus dados
        </Link>
        .
      </p>
      <Button asChild className="self-start">
        <Link href="/eventos">Ver eventos</Link>
      </Button>
    </div>
  );
}
