"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  holderNameSchema,
  type Account,
  type OrderBody,
  type PaymentSessionBody,
} from "@vira/shared";
import {
  Alert,
  Button,
  buttonClassName,
  EmptyState,
  Input,
  Modal,
  ModalContent,
  Spinner,
} from "@vira/ui";

import { CheckoutSteps } from "@/components/checkout/checkout-steps";
import { OrderSummary } from "@/components/checkout/order-summary";
import { PaymentForm } from "@/components/checkout/payment-form";
import { ReservationTimer } from "@/components/checkout/reservation-timer";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { extendOrder, getOrder, setHolders, startPayment } from "@/lib/api/orders";
import { eventPathWith } from "@/lib/checkout/selection";
import { formatPrice } from "@/lib/format";
import { useSession } from "@/lib/session/session-provider";

type Loaded =
  | { status: "loading" }
  | { status: "ready"; order: OrderBody }
  | { status: "not-found" }
  | { status: "failed"; message: string };

/** One input per ticket, in the order of the lines. */
interface Holder {
  key: string;
  orderItemId: string;
  label: string;
  value: string;
  error?: string | undefined;
}

export interface CheckoutViewProps {
  orderId: string;
  /** Came back to a reservation that already existed for the event. */
  resumed: boolean;
}

/**
 * The checkout (docs/DESIGN.md, 4.3): the reservation's countdown, the summary, a name
 * for each ticket and then Stripe's Payment Element. Everything is read from the order
 * the API keeps; the page never decides a price, a quantity or a deadline.
 */
export function CheckoutView({ orderId, resumed }: CheckoutViewProps) {
  const router = useRouter();
  const session = useSession();
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [expired, setExpired] = useState(false);

  const account = session.state.status === "authenticated" ? session.state.account : null;

  useEffect(() => {
    if (session.state.status === "anonymous") {
      router.replace(`/entrar?next=${encodeURIComponent(`/checkout/${orderId}`)}`);
    }
  }, [session.state.status, orderId, router]);

  useEffect(() => {
    if (!account) return;
    let active = true;
    getOrder(orderId)
      .then((order) => {
        if (!active) return;
        if (order.status === "PAID") {
          router.replace(`/checkout/${order.id}/confirmacao`);
          return;
        }
        setLoaded({ status: "ready", order });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoaded(
          error instanceof ApiError && error.status === 404
            ? { status: "not-found" }
            : { status: "failed", message: messageFor(error) },
        );
      });
    return () => {
      active = false;
    };
  }, [account, orderId, router]);

  const onExpired = useCallback(() => {
    setExpired(true);
  }, []);

  if (session.state.status === "unavailable") {
    return <Failure message={messageFor(new ApiError({ status: 0, code: "unavailable" }))} />;
  }
  if (loaded.status === "not-found") {
    return (
      <EmptyState title="Pedido não encontrado" className="py-16">
        Este pedido não existe ou é de outra conta.
      </EmptyState>
    );
  }
  if (loaded.status === "failed") return <Failure message={loaded.message} />;
  if (loaded.status === "loading" || !account) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Carregando sua reserva" />
      </div>
    );
  }

  const { order } = loaded;
  const retryPath = eventPathWith(
    order.event.slug,
    order.items[0]
      ? { ticketTypeId: order.items[0].ticketTypeId, quantity: order.items[0].quantity }
      : null,
  );

  if (order.status !== "PENDING") {
    return (
      <EmptyState
        title={order.status === "CANCELED" ? "Reserva cancelada" : "Reserva encerrada"}
        className="py-16"
        action={
          <Link href={retryPath} className={buttonClassName("primary", "lg")}>
            Voltar ao evento
          </Link>
        }
      >
        {order.status === "CANCELED"
          ? "Esta reserva foi cancelada e os ingressos voltaram à venda."
          : "O prazo desta reserva acabou e os ingressos voltaram à venda."}
      </EmptyState>
    );
  }

  return (
    <>
      <PendingCheckout
        order={order}
        account={account}
        resumed={resumed}
        onOrder={(next) => {
          setLoaded({ status: "ready", order: next });
        }}
        onExpired={onExpired}
        onPaid={() => {
          router.push(`/checkout/${order.id}/confirmacao`);
        }}
      />
      <Modal
        open={expired}
        onOpenChange={(open) => {
          if (!open) router.push(retryPath);
        }}
      >
        <ModalContent
          title="Sua reserva expirou"
          description="Os 10 minutos acabaram e os ingressos voltaram à venda. Você pode tentar de novo com a mesma escolha, se ainda houver ingressos."
          closeLabel="Voltar ao evento"
          footer={
            <Button
              size="lg"
              onClick={() => {
                router.push(retryPath);
              }}
            >
              Tentar de novo
            </Button>
          }
        />
      </Modal>
    </>
  );
}

function PendingCheckout({
  order,
  account,
  resumed,
  onOrder,
  onExpired,
  onPaid,
}: {
  order: OrderBody;
  account: Account;
  resumed: boolean;
  onOrder: (order: OrderBody) => void;
  onExpired: () => void;
  onPaid: () => void;
}) {
  const [holders, setHolderInputs] = useState<Holder[]>(() => holdersOf(order, account));
  const [payment, setPayment] = useState<PaymentSessionBody | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = payment ? 2 : 1;

  async function extend() {
    try {
      onOrder(await extendOrder(order.id));
    } catch (caught) {
      setError(messageFor(caught));
    }
  }

  async function continueToPayment() {
    const checked = holders.map((holder) => {
      const parsed = holderNameSchema.safeParse(holder.value);
      return { ...holder, error: parsed.success ? undefined : parsed.error.issues[0]?.message };
    });
    setHolderInputs(checked);
    const firstInvalid = checked.find((holder) => holder.error);
    if (firstInvalid) {
      document.getElementById(firstInvalid.key)?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const named = await setHolders(order.id, {
        holders: order.items.map((item) => ({
          orderItemId: item.id,
          names: checked
            .filter((holder) => holder.orderItemId === item.id)
            .map((holder) => holder.value.trim()),
        })),
      });
      onOrder(named);
      setPayment(await startPayment(order.id));
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSaving(false);
    }
  }

  const returnUrl =
    typeof window === "undefined"
      ? ""
      : new URL(`/checkout/${order.id}/confirmacao`, window.location.origin).toString();

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <CheckoutSteps current={step} />
        <ReservationTimer
          expiresAt={order.expiresAt}
          extensionAvailable={order.extensionAvailable}
          onExtend={extend}
          onExpired={onExpired}
        />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-12">
        <div className="lg:order-2 lg:col-span-5">
          <OrderSummary order={order} />
        </div>

        <div className="flex flex-col gap-8 lg:order-1 lg:col-span-7">
          <h1 className="sr-only">Finalizar compra</h1>
          {resumed ? (
            <Alert title="Você já tinha uma reserva para este evento">
              Continuamos de onde você parou. Para mudar a escolha, deixe esta reserva expirar.
            </Alert>
          ) : null}

          <section aria-labelledby="seus-dados">
            <h2 id="seus-dados" className="text-h2-sm md:text-h2">
              Seus dados
            </h2>
            <dl className="mt-4 grid gap-1 text-body">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-ink-muted">Nome:</dt>
                <dd>{account.name}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-ink-muted">E-mail:</dt>
                <dd>{account.email}</dd>
              </div>
            </dl>
            <p className="mt-1 text-body-sm text-ink-muted">
              Os ingressos serão enviados para este e-mail.
            </p>

            <fieldset className="mt-6 flex flex-col gap-4" disabled={step === 2}>
              <legend className="mb-1 text-h3">Titulares</legend>
              <p className="text-body-sm text-ink-muted">
                O nome de cada ingresso, conferido na entrada do evento.
              </p>
              {holders.map((holder, index) => (
                <Input
                  key={holder.key}
                  id={holder.key}
                  label={holder.label}
                  value={holder.value}
                  error={holder.error}
                  autoComplete={index === 0 ? "name" : "off"}
                  maxLength={120}
                  onChange={(event) => {
                    const value = event.target.value;
                    setHolderInputs((current) =>
                      current.map((item) =>
                        item.key === holder.key ? { ...item, value, error: undefined } : item,
                      ),
                    );
                  }}
                />
              ))}
            </fieldset>

            {step === 1 ? (
              <Button
                size="lg"
                className="mt-6 w-full"
                loading={saving}
                loadingLabel="Salvando…"
                onClick={() => void continueToPayment()}
              >
                Continuar para o pagamento
              </Button>
            ) : (
              <Button
                variant="link"
                className="mt-4"
                onClick={() => {
                  setPayment(null);
                }}
              >
                Alterar os titulares
              </Button>
            )}
            {error ? (
              <Alert variant="danger" className="mt-4">
                {error}
              </Alert>
            ) : null}
          </section>

          {payment ? (
            <section aria-labelledby="pagamento">
              <h2 id="pagamento" className="text-h2-sm md:text-h2">
                Pagamento
              </h2>
              <div className="mt-4">
                <PaymentForm
                  session={payment}
                  payLabel={`Pagar ${formatPrice(order.total)}`}
                  returnUrl={returnUrl}
                  onPaid={onPaid}
                />
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** The inputs, filled with the names already saved, or the buyer's on the first ticket. */
function holdersOf(order: OrderBody, account: Account): Holder[] {
  const total = order.items.reduce((sum, item) => sum + item.quantity, 0);
  let position = 0;
  return order.items.flatMap((item) =>
    Array.from({ length: item.quantity }, (_, index) => {
      position += 1;
      const label =
        total === 1
          ? `Titular do ingresso (${item.name})`
          : `Titular do ingresso ${String(position)} (${item.name})`;
      return {
        key: `titular-${item.id}-${String(index)}`,
        orderItemId: item.id,
        label,
        value: item.holderNames[index] ?? (position === 1 ? account.name : ""),
      };
    }),
  );
}

function Failure({ message }: { message: string }) {
  return (
    <Alert variant="danger" title="Não foi possível abrir sua reserva" className="mt-8">
      {message}
    </Alert>
  );
}
