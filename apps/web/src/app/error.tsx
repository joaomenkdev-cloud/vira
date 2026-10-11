"use client";

import { Button, EmptyState } from "@vira/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="sr-only">Erro ao carregar a página</h1>
      <EmptyState
        headingLevel={2}
        title="Não foi possível carregar"
        action={<Button onClick={reset}>Tentar novamente</Button>}
      >
        Verifique sua conexão e tente de novo.
      </EmptyState>
    </div>
  );
}
