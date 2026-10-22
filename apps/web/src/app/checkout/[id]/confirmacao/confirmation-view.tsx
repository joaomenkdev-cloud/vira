"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";
import type { OrderBody, TicketSummaryBody } from "@vira/shared";
import { Alert, Button, buttonClassName, EmptyState, Icon, Spinner } from "@vira/ui";

import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { getOrder, listUpcomingTickets } from "@/lib/api/orders";
import { formatDayAndTime, formatPrice } from "@/lib/format";
import { useSession } from "@/lib/session/session-provider";

/** How often and for how long to ask whether the webhook has arrived. */
const POLL_INTERVAL_MS = 1500;
const POLL_ATTEMPTS = 40;

type State =
  | { status: "confirming" }
  | { status: "paid"; order: OrderBody; tickets: TicketSummaryBody[] }
  | { status: "slow" }
  | { status: "closed"; order: OrderBody }
  | { status: "not-found" }
  | { status: "failed"; message: string };

/**
 * "Confirmando pagamento…" until Stripe's webhook marks the order as paid (V4), then the
 * order and its tickets. The page never decides the payment went through: only the
 * order's status does.
 */
export function ConfirmationView({
  orderId,
  paymentFailed,
}: {
  orderId: string;
  paymentFailed: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const [state, setState] = useState<State>({ status: "confirming" });
  const [round, setRound] = useState(0);
  const signedIn = session.state.status === "authenticated";

  useEffect(() => {
    if (session.state.status === "anonymous") {
      router.replace(`/entrar?next=${encodeURIComponent(`/checkout/${orderId}/confirmacao`)}`);
    }
  }, [session.state.status, orderId, router]);

  useEffect(() => {
    if (!signedIn || paymentFailed) return;
    let active = true;
    // A function, so a check that awaited sees the cleanup that ran meanwhile.
    const stopped = () => !active;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check(attempt: number) {
      try {
        const order = await getOrder(orderId);
        if (stopped()) return;
        if (order.status === "PAID") {
          const { data } = await listUpcomingTickets();
          if (!stopped()) {
            setState({
              status: "paid",
              order,
              tickets: data.filter((ticket) => ticket.orderId === order.id),
            });
          }
          return;
        }
        if (order.status !== "PENDING") {
          setState({ status: "closed", order });
          return;
        }
        if (attempt + 1 >= POLL_ATTEMPTS) {
          setState({ status: "slow" });
          return;
        }
        timer = setTimeout(() => void check(attempt + 1), POLL_INTERVAL_MS);
      } catch (error) {
        if (stopped()) return;
        setState(
          error instanceof ApiError && error.status === 404
            ? { status: "not-found" }
            : { status: "failed", message: messageFor(error) },
        );
      }
    }

    void check(0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [signedIn, orderId, paymentFailed, round]);

  if (paymentFailed) {
    return (
      <EmptyState
        title="O pagamento não foi concluído"
        className="py-16"
        action={
          <Link href={`/checkout/${orderId}`} className={buttonClassName("primary", "lg")}>
            Voltar ao pagamento
          </Link>
        }
      >
        O banco não autorizou a compra. Nada foi cobrado; você pode tentar de novo enquanto a
        reserva estiver valendo.
      </EmptyState>
    );
  }

  switch (state.status) {
    case "confirming":
      return (
        <div className="flex flex-col items-center gap-4 py-24 text-center" role="status">
          <Spinner size={24} decorative />
          <h1 className="text-h2-sm md:text-h2">Confirmando pagamento…</h1>
          <p className="text-body text-ink-muted">Isso costuma levar poucos segundos.</p>
        </div>
      );
    case "slow":
      return (
        <EmptyState
          title="O pagamento está demorando para confirmar"
          className="py-16"
          action={
            <Button
              size="lg"
              onClick={() => {
                setState({ status: "confirming" });
                setRound((value) => value + 1);
              }}
            >
              Verificar de novo
            </Button>
          }
        >
          Se o pagamento for aprovado, você recebe os ingressos por e-mail. Se não for, nada é
          cobrado e os ingressos voltam à venda quando a reserva expirar.
        </EmptyState>
      );
    case "closed":
      return (
        <EmptyState
          title="Esta reserva não está mais ativa"
          className="py-16"
          action={
            <Link
              href={`/eventos/${encodeURIComponent(state.order.event.slug)}`}
              className={buttonClassName("primary", "lg")}
            >
              Voltar ao evento
            </Link>
          }
        >
          {state.order.status === "REFUNDED"
            ? "O pagamento chegou depois do fim da reserva e foi estornado."
            : "O prazo da reserva acabou antes de o pagamento ser confirmado. Nada foi cobrado."}
        </EmptyState>
      );
    case "not-found":
      return (
        <EmptyState title="Pedido não encontrado" className="py-16">
          Este pedido não existe ou é de outra conta.
        </EmptyState>
      );
    case "failed":
      return (
        <Alert variant="danger" title="Não foi possível conferir o pagamento">
          {state.message}
        </Alert>
      );
    case "paid":
      return <Paid order={state.order} tickets={state.tickets} />;
  }
}

function Paid({ order, tickets }: { order: OrderBody; tickets: TicketSummaryBody[] }) {
  return (
    <div className="mx-auto max-w-reading">
      <div className="flex flex-col items-start gap-3">
        <Icon icon={CircleCheck} size={24} className="text-success" />
        <h1 className="text-h1-sm md:text-h1">Pagamento confirmado</h1>
        <p className="text-body-lg text-ink-muted">
          Seus ingressos para <strong className="text-ink">{order.event.title}</strong> estão
          garantidos. Também enviamos tudo para o seu e-mail.
        </p>
      </div>

      <dl className="mt-8 grid gap-3 rounded-lg border border-line bg-surface p-6 text-body">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Pedido</dt>
          <dd className="font-semibold tabular-nums">{order.publicCode}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Quando</dt>
          <dd className="text-right">
            {formatDayAndTime(order.event.startsAt, order.event.timezone)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-muted">Total pago</dt>
          <dd className="tabular-nums">{formatPrice(order.total)}</dd>
        </div>
      </dl>

      <section aria-labelledby="ingressos" className="mt-10">
        <h2 id="ingressos" className="text-h2-sm md:text-h2">
          Ingressos
        </h2>
        <ul role="list" className="mt-4 divide-y divide-line border-y border-line">
          {tickets.map((ticket) => (
            <li
              key={ticket.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-4"
            >
              <span>
                <span className="block text-body font-semibold">{ticket.holderName}</span>
                <span className="block text-body-sm text-ink-muted">{ticket.ticketType.name}</span>
              </span>
              <span className="font-mono text-body tabular-nums">{ticket.code}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-body-sm text-ink-muted">
          Na entrada, apresente o QR Code do ingresso ou informe o código.
        </p>
      </section>

      <Link
        href={`/eventos/${encodeURIComponent(order.event.slug)}`}
        className={buttonClassName("secondary", "lg", "mt-10")}
      >
        Voltar ao evento
      </Link>
    </div>
  );
}
