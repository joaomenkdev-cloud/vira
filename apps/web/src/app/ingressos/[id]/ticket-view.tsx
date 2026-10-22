"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Maximize, Printer } from "lucide-react";
import type { CatalogEventDetail, OrderBody, TicketBody, TicketSummaryBody } from "@vira/shared";
import { Alert, Button, buttonClassName, cn, EmptyState, Icon, Spinner } from "@vira/ui";

import { QrFullscreen } from "@/components/tickets/qr-fullscreen";
import { TicketStub } from "@/components/tickets/ticket-stub";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { getOrder } from "@/lib/api/orders";
import { getPublicEvent, getTicket, listTickets } from "@/lib/api/tickets";
import { formatDayAndTime, formatPrice } from "@/lib/format";
import { useSession } from "@/lib/session/session-provider";

interface Loaded {
  ticket: TicketBody;
  order: OrderBody | null;
  /** The tickets of the same order, this one included, in the API's order. */
  siblings: TicketSummaryBody[];
  event: CatalogEventDetail | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: Loaded }
  | { status: "not-found" }
  | { status: "failed"; message: string };

/**
 * One ticket (docs/DESIGN.md, 4.4): the digital ticket, and beside it the order and the
 * other tickets it came with. The ticket is the only call that must answer; the order,
 * its other tickets and the event's photo are extras the page lives without.
 */
export function TicketView({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const session = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [fullscreen, setFullscreen] = useState(false);
  const signedIn = session.state.status === "authenticated";

  useEffect(() => {
    if (session.state.status === "anonymous") {
      router.replace(`/entrar?next=${encodeURIComponent(`/ingressos/${ticketId}`)}`);
    }
  }, [session.state.status, ticketId, router]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    load(ticketId)
      .then((data) => {
        if (active) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState(
          error instanceof ApiError && error.status === 404
            ? { status: "not-found" }
            : { status: "failed", message: messageFor(error) },
        );
      });
    return () => {
      active = false;
    };
  }, [signedIn, ticketId]);

  if (state.status === "not-found") {
    return (
      <EmptyState
        title="Ingresso não encontrado"
        className="py-16"
        action={
          <Link href="/ingressos" className={buttonClassName("primary", "lg")}>
            Ver meus ingressos
          </Link>
        }
      >
        Este ingresso não existe ou é de outra conta.
      </EmptyState>
    );
  }
  if (state.status === "failed") {
    return (
      <Alert variant="danger" title="Não foi possível abrir o ingresso" className="mt-8">
        {state.message}
      </Alert>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Carregando o ingresso" />
      </div>
    );
  }

  const { ticket, order, siblings, event } = state.data;
  const position = siblings.findIndex((sibling) => sibling.id === ticket.id);
  const previous = position > 0 ? siblings[position - 1] : undefined;
  const next = position >= 0 ? siblings[position + 1] : undefined;
  const directions = event
    ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(
        `${event.venue.name}, ${event.venue.address}, ${event.venue.city} - ${event.venue.state}`,
      )}`
    : null;

  return (
    <>
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href="/ingressos"
          className="inline-flex min-h-11 items-center gap-1 text-label text-ink hover:text-accent-ink"
        >
          <Icon icon={ChevronLeft} size={16} />
          Meus ingressos
        </Link>
        {siblings.length > 1 && position >= 0 ? (
          <p className="text-body-sm text-ink-muted tabular-nums lg:hidden">
            {position + 1} de {siblings.length}
          </p>
        ) : null}
      </div>
      <h1 className="sr-only">
        Ingresso de {ticket.holderName} para {ticket.event.title}
      </h1>

      <div className="mt-4 grid gap-8 lg:grid-cols-12">
        <div className="mx-auto w-full max-w-ticket lg:col-span-6 lg:mx-0">
          <TicketStub ticket={ticket} event={event} />

          {siblings.length > 1 ? (
            <nav
              aria-label="Outros ingressos deste pedido"
              className="mt-4 flex items-center justify-between gap-4 lg:hidden print:hidden"
            >
              <SiblingLink ticket={previous} direction="previous" />
              <SiblingLink ticket={next} direction="next" />
            </nav>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3 print:hidden">
            <Button
              variant="secondary"
              iconStart={Maximize}
              disabled={ticket.status === "CANCELED"}
              onClick={() => {
                setFullscreen(true);
              }}
            >
              Tela cheia
            </Button>
            <Button
              variant="secondary"
              iconStart={Printer}
              onClick={() => {
                window.print();
              }}
            >
              Imprimir
            </Button>
          </div>
        </div>

        <aside
          aria-label="Pedido"
          className="flex flex-col gap-8 lg:col-span-5 lg:col-start-8 print:hidden"
        >
          {order ? (
            <div>
              <p className="text-body font-semibold">Pedido {order.publicCode}</p>
              {order.paidAt ? (
                <p className="mt-1 text-body-sm text-ink-muted">
                  Pago em {formatDayAndTime(order.paidAt, order.event.timezone)} ·{" "}
                  {formatPrice(order.total)}
                </p>
              ) : null}
            </div>
          ) : null}

          {siblings.length > 1 ? (
            <section aria-labelledby="deste-pedido" className="hidden lg:block">
              <h2 id="deste-pedido" className="text-h3">
                Ingressos deste pedido
              </h2>
              <ul role="list" className="mt-3 flex flex-col gap-1">
                {siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <Link
                      href={`/ingressos/${sibling.id}`}
                      aria-current={sibling.id === ticket.id ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-md px-3 text-body hover:bg-surface-sunken",
                        sibling.id === ticket.id && "bg-accent-soft font-semibold",
                      )}
                    >
                      {sibling.holderName} – {sibling.ticketType.name}
                      {sibling.id === ticket.id ? (
                        <span className="text-body-sm text-ink-muted">(este)</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {directions ? (
            <a
              href={directions}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-label underline decoration-1 underline-offset-4 hover:text-accent-ink"
            >
              Como chegar
              <Icon icon={ExternalLink} size={16} />
              <span className="sr-only">(abre o OpenStreetMap)</span>
            </a>
          ) : null}
        </aside>
      </div>

      {ticket.status !== "CANCELED" ? (
        <QrFullscreen
          ticket={ticket}
          open={fullscreen}
          onClose={() => {
            setFullscreen(false);
          }}
        />
      ) : null}
    </>
  );
}

function SiblingLink({
  ticket,
  direction,
}: {
  ticket: TicketSummaryBody | undefined;
  direction: "previous" | "next";
}) {
  const label = direction === "previous" ? "Ingresso anterior" : "Próximo ingresso";
  if (!ticket) return <span />;
  return (
    <Link
      href={`/ingressos/${ticket.id}`}
      className={buttonClassName("ghost", "md", direction === "next" ? "ml-auto" : undefined)}
    >
      {direction === "previous" ? <Icon icon={ChevronLeft} /> : null}
      {label}
      {direction === "next" ? <Icon icon={ChevronRight} /> : null}
    </Link>
  );
}

async function load(ticketId: string): Promise<Loaded> {
  const ticket = await getTicket(ticketId);
  const when = Date.parse(ticket.event.endsAt) <= Date.now() ? "past" : "upcoming";
  const [order, list, event] = await Promise.all([
    getOrder(ticket.orderId).catch(() => null),
    listTickets(when).catch(() => null),
    getPublicEvent(ticket.event.slug).catch(() => null),
  ]);
  const siblings = (list?.data ?? []).filter((item) => item.orderId === ticket.orderId);
  return { ticket, order, siblings, event };
}
