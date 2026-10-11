import type { Metadata } from "next";
import Link from "next/link";

import { Button, EmptyState } from "@vira/ui";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="sr-only">Página não encontrada</h1>
      <EmptyState
        headingLevel={2}
        title="Não encontramos esta página"
        action={
          <Button asChild>
            <Link href="/">Voltar para o início</Link>
          </Button>
        }
      >
        O endereço pode estar errado ou a página foi removida.
      </EmptyState>
    </div>
  );
}
