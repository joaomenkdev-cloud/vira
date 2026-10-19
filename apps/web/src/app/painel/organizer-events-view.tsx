"use client";

import type { OrganizerEventSummary } from "@vira/shared";
import { Alert, Badge, Button, EmptyState, Skeleton } from "@vira/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { FilterChip } from "@/components/filter-chip";
import { OrganizerGate } from "@/components/organizer/organizer-gate";
import { listOrganizerEvents } from "@/lib/api/organizer";
import { messageFor } from "@/lib/api/messages";
import { formatShortDate, formatVenue } from "@/lib/format";
import { PHASE_BADGES, phaseOf } from "@/lib/organizer/event-state";

import { filterHref, STATUS_FILTERS, type StatusFilter } from "./status-filters";

type Load =
  | { status: "loading" }
  | { status: "ready"; events: OrganizerEventSummary[]; nextCursor: string | null }
  | { status: "failed"; message: string };

const NEW_EVENT_HREF = "/painel/eventos/novo";

export function OrganizerEventsView({ filter }: { filter: StatusFilter }) {
  return (
    <OrganizerGate skeleton={<ListSkeleton />}>
      {/* A new filter is a new list: remounted, it starts loading again. */}
      {() => <EventList key={filter.param ?? "todos"} filter={filter} />}
    </OrganizerGate>
  );
}

function Heading({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-h1-sm md:text-h1">Meus eventos</h1>
      {action ? (
        <Button asChild>
          <Link href={NEW_EVENT_HREF}>Criar evento</Link>
        </Button>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      <Heading action={false} />
      <div aria-busy="true" className="mt-10 flex flex-col gap-4">
        <p role="status" className="sr-only">
          Carregando seus eventos…
        </p>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </>
  );
}

function EventList({ filter }: { filter: StatusFilter }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreProblem, setMoreProblem] = useState<string | null>(null);

  const fetchFirstPage = useCallback(async () => {
    try {
      const { data, page } = await listOrganizerEvents({ status: filter.status });
      return { status: "ready", events: data, nextCursor: page.nextCursor } as const;
    } catch (error) {
      return { status: "failed", message: messageFor(error) } as const;
    }
  }, [filter.status]);

  useEffect(() => {
    void fetchFirstPage().then(setLoad);
  }, [fetchFirstPage]);

  async function loadMore(cursor: string) {
    setLoadingMore(true);
    setMoreProblem(null);
    try {
      const { data, page } = await listOrganizerEvents({ status: filter.status, cursor });
      setLoad((current) =>
        current.status === "ready"
          ? { status: "ready", events: [...current.events, ...data], nextCursor: page.nextCursor }
          : current,
      );
    } catch (error) {
      setMoreProblem(messageFor(error));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <Heading />
      <nav aria-label="Filtrar por situação" className="mt-8 -mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {STATUS_FILTERS.map((item) => (
            <li key={item.label}>
              <FilterChip href={filterHref(item)} selected={item.param === filter.param}>
                {item.label}
              </FilterChip>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label="Eventos" aria-busy={load.status === "loading"} className="mt-10">
        {load.status === "loading" ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="sr-only">
              Carregando seus eventos…
            </p>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : load.status === "failed" ? (
          <div className="flex flex-col gap-6">
            <Alert variant="danger" title="Não foi possível carregar seus eventos.">
              {load.message}
            </Alert>
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => {
                setLoad({ status: "loading" });
                void fetchFirstPage().then(setLoad);
              }}
            >
              Tentar de novo
            </Button>
          </div>
        ) : load.events.length === 0 ? (
          filter.status === undefined ? (
            <EmptyState
              title="Seu primeiro evento começa aqui"
              action={
                <Button asChild variant="secondary">
                  <Link href={NEW_EVENT_HREF}>Criar evento</Link>
                </Button>
              }
            >
              Crie um rascunho; ele só fica público quando você publicar.
            </EmptyState>
          ) : (
            <EmptyState
              title={`Nenhum evento em “${filter.label}”`}
              action={
                <Button asChild variant="secondary">
                  <Link href="/painel">Ver todos</Link>
                </Button>
              }
            >
              Os eventos nessa situação aparecem aqui.
            </EmptyState>
          )
        ) : (
          <>
            <ul className="flex flex-col gap-4">
              {load.events.map((event) => (
                <li key={event.id}>
                  <EventRow event={event} />
                </li>
              ))}
            </ul>
            {moreProblem ? <Alert variant="danger" title={moreProblem} className="mt-6" /> : null}
            {load.nextCursor ? (
              <Button
                variant="secondary"
                className="mt-8"
                loading={loadingMore}
                loadingLabel="Carregando…"
                onClick={() => {
                  if (load.nextCursor) void loadMore(load.nextCursor);
                }}
              >
                Mais eventos
              </Button>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}

/**
 * One event of the list. The whole row is the link (one tab stop), like the event card;
 * the summary of the API has no picture, so there is no thumbnail.
 */
function EventRow({ event }: { event: OrganizerEventSummary }) {
  const badge = PHASE_BADGES[phaseOf(event)];
  const tickets =
    event.ticketTypeCount === 1
      ? "1 tipo de ingresso"
      : `${String(event.ticketTypeCount)} tipos de ingresso`;

  return (
    <article className="relative flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 transition-colors duration-base hover:border-line-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:p-5">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-overline text-ink-muted tabular-nums">
          {formatShortDate(event.startsAt, event.timezone, true)}
        </p>
        <h2 className="text-h3 text-ink">
          <Link
            href={`/painel/eventos/${event.id}`}
            className="after:absolute after:inset-0 focus-visible:outline-none"
          >
            {event.title}
          </Link>
        </h2>
        <p className="text-body-sm text-ink-muted">
          {event.venue ? formatVenue(event.venue) : "Local a definir"} · {tickets}
        </p>
      </div>
      <Badge variant={badge.variant} className="self-start sm:self-auto">
        {badge.label}
      </Badge>
    </article>
  );
}
