"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CatalogEventDetail, PublicTicketType } from "@vira/shared";
import { Alert, Badge, Button, cn, QuantityStepper, Radio, RadioGroup } from "@vira/ui";

import { FEW_LEFT, SalesStatus } from "@/components/catalog/ticket-list";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { createOrder } from "@/lib/api/orders";
import { eventPathWith, isSelectable, maxQuantity, type Selection } from "@/lib/checkout/selection";
import { formatPrice } from "@/lib/format";
import { useSession } from "@/lib/session/session-provider";

export interface TicketPickerProps {
  event: CatalogEventDetail;
  /** The choice the address carried (after signing in, or back from an expired reservation). */
  initial: Selection | null;
}

/**
 * The ticket selector of the event page (docs/DESIGN.md, 3.11 and 4.2): one row per
 * type, a radio for the type and a stepper for how many, the total and "Comprar
 * ingresso". On a phone the total and the button live in a bar fixed to the bottom.
 *
 * Buying reserves the tickets (`POST /orders`) and opens the checkout. A visitor goes
 * to the login first, with the choice kept in the address it returns to.
 */
export function TicketPicker({ event, initial }: TicketPickerProps) {
  const router = useRouter();
  const session = useSession();
  const [selected, setSelected] = useState(initial?.ticketTypeId ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLFieldSetElement>(null);
  // One key per purchase attempt: a retry after a lost answer finds the same order.
  const attempt = useRef<{ key: string; for: string } | null>(null);

  const ticketType = event.ticketTypes.find((type) => type.id === selected);
  const total = ticketType ? ticketType.price.amountCents * quantity : 0;
  const totalLabel = formatPrice({ amountCents: total, currency: "BRL" });

  function choose(id: string) {
    setSelected(id);
    setError(null);
    const chosen = event.ticketTypes.find((type) => type.id === id);
    if (chosen) setQuantity((current) => Math.min(Math.max(current, 1), maxQuantity(chosen)));
  }

  async function buy() {
    if (!ticketType) {
      pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      pickerRef.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
      return;
    }
    const selection = { ticketTypeId: ticketType.id, quantity };
    if (session.state.status !== "authenticated") {
      const next = eventPathWith(event.slug, selection);
      router.push(`/entrar?next=${encodeURIComponent(next)}`);
      return;
    }

    const fingerprint = `${selection.ticketTypeId}:${String(selection.quantity)}`;
    if (attempt.current?.for !== fingerprint) {
      attempt.current = { key: crypto.randomUUID(), for: fingerprint };
    }
    setBuying(true);
    setError(null);
    try {
      const order = await createOrder(
        { eventId: event.id, items: [{ ticketTypeId: selection.ticketTypeId, quantity }] },
        attempt.current.key,
      );
      router.push(`/checkout/${order.id}`);
    } catch (caught) {
      setBuying(false);
      if (caught instanceof ApiError && caught.code === "pending-order-exists") {
        const orderId = caught.problem?.orderId;
        if (orderId) {
          router.push(`/checkout/${orderId}?retomada=1`);
          return;
        }
      }
      // A refused attempt is over: the next click is a new purchase.
      if (caught instanceof ApiError && caught.status > 0 && caught.status < 500) {
        attempt.current = null;
      }
      if (
        caught instanceof ApiError &&
        (caught.code === "insufficient-inventory" || caught.code === "sales-closed")
      ) {
        router.refresh();
      }
      setError(messageFor(caught));
    }
  }

  const waitingForSession = session.state.status === "loading";
  const cta = (
    <Button
      size="lg"
      className="w-full"
      onClick={() => void buy()}
      loading={buying}
      loadingLabel="Reservando…"
      disabled={waitingForSession}
    >
      {ticketType ? "Comprar ingresso" : "Ver ingressos"}
    </Button>
  );

  return (
    <>
      <RadioGroup
        ref={pickerRef}
        legend={<span className="sr-only">Escolha o tipo de ingresso</span>}
        value={selected}
        onValueChange={choose}
        className="mt-4"
      >
        <ul role="list" className="flex flex-col gap-2">
          {event.ticketTypes.map((type) => (
            <TicketOption
              key={type.id}
              ticketType={type}
              timeZone={event.timezone}
              selected={type.id === selected}
              quantity={quantity}
              onQuantityChange={setQuantity}
            />
          ))}
        </ul>
      </RadioGroup>

      {error ? (
        <Alert variant="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}

      <div className="mt-6 hidden lg:block">
        <TotalLine label={totalLabel} quantity={ticketType ? quantity : 0} />
        <div className="mt-4">{cta}</div>
        <PurchaseNote />
      </div>
      <div className="lg:hidden">
        <PurchaseNote />
      </div>

      {/* The phone's bar: always the total and the button (docs/DESIGN.md, 4.2). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-line bg-surface px-4 pt-3 pb-safe shadow-float lg:hidden">
        <div className="mx-auto flex max-w-event items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-body-sm text-ink-muted">
              {ticketType ? ticketCount(quantity) : "Escolha o ingresso"}
            </p>
            <p className="text-price tabular-nums">{ticketType ? totalLabel : "—"}</p>
          </div>
          <div className="w-auto shrink-0">{cta}</div>
        </div>
      </div>
    </>
  );
}

function TicketOption({
  ticketType,
  timeZone,
  selected,
  quantity,
  onQuantityChange,
}: {
  ticketType: PublicTicketType;
  timeZone: string;
  selected: boolean;
  quantity: number;
  onQuantityChange: (value: number) => void;
}) {
  const selectable = isSelectable(ticketType);
  const price = formatPrice(ticketType.price);
  return (
    <li
      className={cn(
        "rounded-md border px-4 py-2 transition-colors duration-fast",
        selected ? "border-accent bg-accent-soft" : "border-line bg-surface",
      )}
    >
      <Radio
        value={ticketType.id}
        disabled={!selectable}
        label={
          <span className="flex items-baseline justify-between gap-4">
            <span className={cn("font-semibold", selectable ? "text-ink" : "text-ink-subtle")}>
              {ticketType.name}
            </span>
            <span
              className={cn(
                "shrink-0 text-body tabular-nums",
                selectable ? "text-ink" : "text-ink-subtle",
              )}
            >
              {price}
            </span>
          </span>
        }
        description={
          ticketType.description || !selectable || ticketType.available <= FEW_LEFT ? (
            <>
              {ticketType.description ? <span>{ticketType.description}</span> : null}
              {selectable ? (
                ticketType.available <= FEW_LEFT ? (
                  <Badge variant="accent" className="mt-2 w-fit">
                    Últimos ingressos
                  </Badge>
                ) : null
              ) : (
                <SalesStatus ticketType={ticketType} timeZone={timeZone} />
              )}
            </>
          ) : undefined
        }
        className="[&>div:last-child]:flex-1"
      />
      {selected ? (
        <div className="flex items-center justify-between gap-4 pt-1 pb-2 pl-8">
          <span className="text-body-sm text-ink-muted">Quantidade</span>
          <QuantityStepper
            label={`Quantidade de ${ticketType.name}`}
            value={quantity}
            onValueChange={onQuantityChange}
            min={1}
            max={maxQuantity(ticketType)}
          />
        </div>
      ) : null}
    </li>
  );
}

function TotalLine({ label, quantity }: { label: string; quantity: number }) {
  return (
    <div className="flex items-baseline justify-between border-t border-line pt-4">
      <span className="text-body text-ink-muted">
        Total{quantity > 0 ? ` · ${ticketCount(quantity)}` : ""}
      </span>
      <span className="text-price tabular-nums" aria-live="polite">
        {label}
      </span>
    </div>
  );
}

function PurchaseNote() {
  return (
    <p className="mt-3 text-body-sm text-ink-muted">
      Os ingressos ficam reservados por 10 minutos depois do clique. Pagamento de teste via Stripe.
    </p>
  );
}

function ticketCount(quantity: number): string {
  return quantity === 1 ? "1 ingresso" : `${String(quantity)} ingressos`;
}
