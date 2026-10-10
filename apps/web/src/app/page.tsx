import { EmptyState } from "@vira/ui";

/**
 * Home. There is no event listing yet, so the page shows the promise of the product
 * and a well-designed empty state. Demonstration events will come from the seed,
 * always labelled "Demonstração" (ADR-0010); nothing is invented here.
 */
export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8">
      <section className="pt-12 pb-16 md:pt-24 md:pb-24 lg:pt-32">
        <h1 className="max-w-3xl text-display-sm md:text-display">Encontre seu próximo evento.</h1>
        <p className="mt-6 max-w-reading text-body-lg text-ink-muted">
          Descubra eventos, compre seu ingresso e entre com o QR Code.
        </p>
      </section>

      <section aria-labelledby="destaques" className="pb-24 md:pb-32">
        <h2 id="destaques" className="text-h2">
          Em destaque
        </h2>
        <EmptyState title="Nenhum evento por aqui ainda">
          Quando organizadores publicarem eventos, eles aparecem nesta página.
        </EmptyState>
      </section>
    </div>
  );
}
