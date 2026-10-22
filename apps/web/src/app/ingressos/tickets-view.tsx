"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TicketSummaryBody } from "@vira/shared";
import { Alert, Badge, Button, buttonClassName, EmptyState, Skeleton } from "@vira/ui";

import { messageFor } from "@/lib/api/messages";
import { listTickets, type TicketsWhen } from "@/lib/api/tickets";
import { formatShortDate } from "@/lib/format";
import { useSession } from "@/lib/session/session-provider";

type State =
  | { status: "loading" }
  | { status: "ready"; tickets: TicketSummaryBody[]; cursor: string | null }
  | { status: "failed"; message: string };

/** The list of "Meus ingressos": one row per ticket, each leading to its QR Code. */
export function TicketsView({ when }: { when: TicketsWhen }) {
  const router = useRouter();
  const session = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const signedIn = session.state.status === "authenticated";

  useEffect(() => {
    if (session.state.status === "anonymous") router.replace("/entrar?next=/ingressos");
  }, [session.state.status, router]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    listTickets(when)
      .then(({ data, page }) => {
        if (active) setState({ status: "ready", tickets: data, cursor: page.nextCursor });
      })
      .catch((error: unknown) => {
        if (active) setState({ status: "failed", message: messageFor(error) });
      });
    return () => {
      active = false;
    };
  }, [signedIn, when]);

  async function loadMore(current: { tickets: TicketSummaryBody[]; cursor: string }) {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const { data, page } = await listTickets(when, current.cursor);
      setState({
        status: "ready",
        tickets: [...current.tickets, ...data],
        cursor: page.nextCursor,
      });
    } catch (error) {
      setMoreError(messageFor(error));
    } finally {
      setLoadingMore(false);
    }
  }

  if (state.status === "failed") {
    return (
      <Alert variant="danger" title="Não foi possível carregar seus ingressos" className="mt-8">
        {state.message}
      </Alert>
    );
  }
  if (state.status === "loading") {
    return (
      <div aria-busy="true" aria-label="Carregando seus ingressos" className="mt-8 grid gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (state.tickets.length === 0) {
    return when === "upcoming" ? (
      <EmptyState
        title="Você ainda não tem ingressos"
        className="py-16"
        action={
          <Link href="/eventos" className={buttonClassName("primary", "lg")}>
            Explorar eventos
          </Link>
        }
      >
        Os ingressos que você comprar aparecem aqui e no seu e-mail.
      </EmptyState>
    ) : (
      <EmptyState title="Nenhum ingresso de eventos passados" className="py-16">
        Depois que um evento acontece, os ingressos dele ficam guardados aqui.
      </EmptyState>
    );
  }

  const { cursor, tickets } = state;
  return (
    <>
      <ul role="list" className="mt-8 grid gap-3 md:grid-cols-2">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <TicketRow ticket={ticket} />
          </li>
        ))}
      </ul>
      {moreError ? (
        <Alert variant="danger" className="mt-4">
          {moreError}
        </Alert>
      ) : null}
      {cursor ? (
        <div className="mt-8 flex justify-center">
          <Button
            variant="secondary"
            loading={loadingMore}
            loadingLabel="Carregando…"
            onClick={() => void loadMore({ tickets, cursor })}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </>
  );
}

function TicketRow({ ticket }: { ticket: TicketSummaryBody }) {
  const place = [ticket.event.venueName, ticket.event.venueCity].filter(Boolean).join(" · ");
  return (
    <article className="relative flex h-full flex-col gap-1 rounded-lg border border-line bg-surface p-4 transition-colors duration-fast has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-accent hover:border-line-strong">
      <p className="flex flex-wrap items-center gap-2 text-overline text-accent uppercase">
        <time dateTime={ticket.event.startsAt}>
          {formatShortDate(ticket.event.startsAt, ticket.event.timezone, true)}
        </time>
        {ticket.status === "USED" ? <Badge variant="neutral">Utilizado</Badge> : null}
        {ticket.status === "CANCELED" ? <Badge variant="danger">Cancelado</Badge> : null}
      </p>
      <h2 className="text-h3">
        <Link
          href={`/ingressos/${ticket.id}`}
          className="after:absolute after:inset-0 focus-visible:outline-none"
        >
          {ticket.event.title}
        </Link>
      </h2>
      <p className="text-body">
        {ticket.holderName} · {ticket.ticketType.name}
      </p>
      {place ? <p className="text-body-sm text-ink-muted">{place}</p> : null}
      <p className="mt-1 font-mono text-body-sm tracking-widest text-ink-muted">{ticket.code}</p>
    </article>
  );
}
