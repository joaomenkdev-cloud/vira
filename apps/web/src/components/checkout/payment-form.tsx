"use client";

import type { Stripe, StripeElements } from "@stripe/stripe-js";
// The pure entry point loads Stripe.js only when called, on the payment step.
import { loadStripe } from "@stripe/stripe-js/pure";
import { useEffect, useRef, useState } from "react";
import type { PaymentSessionBody } from "@vira/shared";
import { Alert, Button, Skeleton } from "@vira/ui";

/** Stripe's look for the Payment Element, from the design tokens (docs/DESIGN.md, 2). */
const APPEARANCE = {
  theme: "stripe",
  variables: {
    colorPrimary: "#0b0b0c",
    colorText: "#0b0b0c",
    colorDanger: "#b42318",
    colorBackground: "#ffffff",
    borderRadius: "8px",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    spacingUnit: "4px",
  },
} as const;

type Loading =
  | { status: "loading" }
  | { status: "ready"; stripe: Stripe; elements: StripeElements }
  | { status: "failed" };

export interface PaymentFormProps {
  session: PaymentSessionBody;
  /** "Pagar R$ 160,00". */
  payLabel: string;
  /** Where Stripe sends the buyer back after a bank's own verification (3-D Secure). */
  returnUrl: string;
  /** The payment went through on Stripe's side: the webhook confirms the order. */
  onPaid: () => void;
}

/**
 * The card form of the checkout: Stripe's Payment Element, loaded from js.stripe.com
 * only on this step, in an iframe of Stripe's, so the card number never touches Vira
 * (ADR-0006). Paying does not mark the order: only the webhook does (V4).
 */
export function PaymentForm({ session, payLabel, returnUrl, onPaid }: PaymentFormProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<Loading>({ status: "loading" });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unmount: (() => void) | undefined;
    loadStripe(session.publishableKey, { locale: "pt-BR" })
      .then((stripe) => {
        if (!active) return;
        if (!stripe || !mountRef.current) {
          setLoading({ status: "failed" });
          return;
        }
        const elements = stripe.elements({
          clientSecret: session.clientSecret,
          appearance: APPEARANCE,
        });
        const element = elements.create("payment", { layout: "tabs" });
        element.mount(mountRef.current);
        unmount = () => {
          element.destroy();
        };
        setLoading({ status: "ready", stripe, elements });
      })
      .catch(() => {
        if (active) setLoading({ status: "failed" });
      });
    return () => {
      active = false;
      unmount?.();
    };
  }, [session.clientSecret, session.publishableKey]);

  async function pay() {
    if (loading.status !== "ready") return;
    setPaying(true);
    setError(null);
    const { error: failure } = await loading.stripe.confirmPayment({
      elements: loading.elements,
      redirect: "if_required",
      confirmParams: { return_url: returnUrl },
    });
    if (failure) {
      setPaying(false);
      // Card and form errors come from Stripe already written for the buyer.
      setError(
        failure.type === "card_error" || failure.type === "validation_error"
          ? (failure.message ?? "Confira os dados do cartão.")
          : "Não foi possível concluir o pagamento. Tente de novo em instantes.",
      );
      return;
    }
    onPaid();
  }

  return (
    <div className="flex flex-col gap-4">
      {loading.status === "loading" ? (
        <div aria-busy="true" aria-label="Carregando o formulário de pagamento">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="mt-3 h-12 w-full" />
        </div>
      ) : null}
      {loading.status === "failed" ? (
        <Alert variant="danger" title="O formulário de pagamento não carregou">
          Confira sua conexão e recarregue a página. Sua reserva continua valendo até o fim do
          prazo.
        </Alert>
      ) : null}
      <div ref={mountRef} data-testid="payment-element" />

      <Alert title="Modo de teste">
        Nenhuma cobrança é feita. Use o cartão 4242 4242 4242 4242, qualquer validade futura e
        qualquer CVC.
      </Alert>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      <Button
        size="lg"
        className="w-full"
        onClick={() => void pay()}
        loading={paying}
        loadingLabel="Processando pagamento…"
        disabled={loading.status !== "ready"}
      >
        {payLabel}
      </Button>
    </div>
  );
}
