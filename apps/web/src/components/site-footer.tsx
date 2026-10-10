const REPOSITORY_URL = "https://github.com/joaomenkdev-cloud/vira";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-page flex-col gap-2 px-4 py-6 text-body-sm text-ink-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p>Pagamentos em modo de teste: nenhuma cobrança real é feita.</p>
        <p>
          Projeto de código aberto (MIT).{" "}
          <a
            href={REPOSITORY_URL}
            className="inline-flex min-h-11 items-center rounded-sm text-ink underline underline-offset-4 hover:text-accent-ink"
          >
            Ver no GitHub
          </a>
        </p>
      </div>
    </footer>
  );
}
