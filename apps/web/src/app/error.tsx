"use client";

import { EmptyState } from "@/components/empty-state";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-24 sm:px-6 lg:px-8">
      <h1 className="sr-only">Erro ao carregar a página</h1>
      <EmptyState
        title="Não foi possível carregar"
        action={
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-body font-semibold text-on-accent duration-fast hover:bg-accent-hover active:scale-98"
          >
            Tentar novamente
          </button>
        }
      >
        Verifique sua conexão e tente de novo.
      </EmptyState>
    </div>
  );
}
