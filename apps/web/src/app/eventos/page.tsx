import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, EmptyState, Icon, Input } from "@vira/ui";

import { CatalogEventCard, EventGrid } from "@/components/catalog/catalog-event-card";
import { WeekendChip } from "@/components/catalog/weekend-chip";
import { InvalidCursorError, listEvents } from "@/lib/catalog/api";
import { exploreHref, parseExploreSearch, type SearchParams } from "@/lib/catalog/search";

export const metadata: Metadata = {
  title: "Explorar eventos",
  description: "Busque eventos por nome, cidade ou data e veja os próximos.",
  alternates: { canonical: "/eventos" },
};

/**
 * Explore (the "Ver todos" of the home page and its search): every upcoming event, or
 * the ones matching the search, a page at a time. Everything lives in the address, so
 * it works without JavaScript and a search can be shared.
 */
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const search = parseExploreSearch(await searchParams, new Date());
  const result = await listEvents(search.query).catch((error: unknown) => {
    if (error instanceof InvalidCursorError) return null;
    throw error;
  });

  return (
    <div className="mx-auto w-full max-w-page px-4 pt-12 pb-24 sm:px-6 md:pt-16 lg:px-8 lg:pb-32">
      <h1 className="text-h1-sm md:text-h1">
        {search.filtered ? "Buscar eventos" : "Próximos eventos"}
      </h1>

      <form
        role="search"
        action="/eventos"
        className="mt-8 grid gap-4 md:grid-cols-12 md:items-start"
      >
        <Input
          type="search"
          name="q"
          label="Evento"
          optional
          placeholder="Ex.: forró"
          defaultValue={search.q}
          maxLength={80}
          enterKeyHint="search"
          autoComplete="off"
          error={search.qError}
          className="md:col-span-6"
        />
        <Input
          name="cidade"
          label="Cidade"
          optional
          placeholder="Ex.: Recife"
          defaultValue={search.city}
          maxLength={80}
          autoComplete="address-level2"
          className="md:col-span-4"
        />
        {/* Keeps the weekend filter on while the text changes. */}
        {search.weekend ? <input type="hidden" name="periodo" value="fim-de-semana" /> : null}
        <Button type="submit" size="lg" variant="secondary" className="md:col-span-2 md:mt-7">
          Buscar
        </Button>
      </form>
      <div className="mt-4 flex gap-2">
        <WeekendChip
          href={exploreHref(search, { weekend: !search.weekend })}
          selected={search.weekend}
        />
      </div>

      <section aria-labelledby="resultados" aria-live="polite" className="mt-12">
        <h2 id="resultados" className="sr-only">
          Resultados
        </h2>
        {result === null ? (
          <EmptyState
            title="Esta página da lista expirou"
            action={
              <Button asChild variant="secondary">
                <Link href={exploreHref(search)}>Voltar ao início da lista</Link>
              </Button>
            }
          >
            O endereço da página foi alterado ou é de outra busca.
          </EmptyState>
        ) : result.data.length === 0 ? (
          search.filtered ? (
            <EmptyState
              title={search.q ? `Nada encontrado para "${search.q}"` : "Nada encontrado"}
              action={
                <Button asChild variant="secondary">
                  <Link href="/eventos">Limpar filtros</Link>
                </Button>
              }
            >
              Tente outra palavra ou remova os filtros.
            </EmptyState>
          ) : (
            <EmptyState title="Nenhum evento por aqui ainda">
              Quando organizadores publicarem eventos, eles aparecem nesta página.
            </EmptyState>
          )
        ) : (
          <>
            <EventGrid>
              {result.data.map((event) => (
                <li key={event.id} className="flex">
                  <CatalogEventCard event={event} className="w-full" />
                </li>
              ))}
            </EventGrid>
            {result.page.nextCursor ? (
              <div className="mt-12 flex justify-center">
                <Button asChild variant="secondary" size="lg">
                  <Link href={exploreHref(search, { cursor: result.page.nextCursor })}>
                    Mais eventos
                    <Icon icon={ArrowRight} />
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
