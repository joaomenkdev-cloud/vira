import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="sr-only">Página não encontrada</h1>
      <EmptyState
        title="Não encontramos esta página"
        action={
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-body font-semibold text-on-accent duration-fast hover:bg-accent-hover active:scale-98"
          >
            Voltar para o início
          </Link>
        }
      >
        O endereço pode estar errado ou a página foi removida.
      </EmptyState>
    </div>
  );
}
