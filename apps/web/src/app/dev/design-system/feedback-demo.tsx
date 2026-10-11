"use client";

import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Skeleton,
  SkeletonText,
  useToast,
  type AlertVariant,
  type BadgeVariant,
} from "@vira/ui";

import { ComponentSection, StateLabel } from "./section";

const BADGES: readonly { variant: BadgeVariant; label: string }[] = [
  { variant: "neutral", label: "Demonstração" },
  { variant: "accent", label: "Últimos ingressos" },
  { variant: "success", label: "Pago" },
  { variant: "warning", label: "Aguardando pagamento" },
  { variant: "danger", label: "Cancelado" },
];

const ALERTS: readonly { variant: AlertVariant; title: string; text: string }[] = [
  {
    variant: "success",
    title: "Pagamento confirmado",
    text: "Enviamos o ingresso para seu e-mail.",
  },
  {
    variant: "warning",
    title: "Sua reserva termina em 2 minutos",
    text: "Mantenha a reserva para não perder os ingressos.",
  },
  {
    variant: "danger",
    title: "Pagamento recusado",
    text: "Confira os dados do cartão ou use outro meio de pagamento.",
  },
  {
    variant: "info",
    title: "Este é um evento de demonstração",
    text: "Nenhuma cobrança real é feita.",
  },
];

export function FeedbackDemo() {
  const { toast } = useToast();

  return (
    <>
      <ComponentSection id="badges" title="Badges">
        <ul className="flex flex-wrap items-center gap-3">
          {BADGES.map(({ variant, label }) => (
            <li key={variant}>
              <Badge variant={variant}>{label}</Badge>
            </li>
          ))}
          <li className="rounded-md bg-ink-muted p-3">
            <Badge variant="on-image">Esgotado</Badge>
          </li>
        </ul>
        <StateLabel>
          O badge sobre imagem (último) tem fundo sólido: aqui está sobre um bloco escuro no lugar
          da foto.
        </StateLabel>
      </ComponentSection>

      <ComponentSection id="alertas" title="Alertas">
        <ul className="grid gap-4 md:grid-cols-2">
          {ALERTS.map(({ variant, title, text }) => (
            <li key={variant}>
              <Alert variant={variant} title={title}>
                {text}
              </Alert>
            </li>
          ))}
        </ul>
      </ComponentSection>

      <ComponentSection id="toasts" title="Toasts">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              toast({ title: "Evento salvo", description: "Ele continua como rascunho." });
            }}
          >
            Toast neutro
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast({ title: "Ingresso copiado", tone: "success" });
            }}
          >
            Toast de sucesso
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              toast({
                title: "Não foi possível salvar",
                description: "Tente de novo em instantes.",
                tone: "danger",
              });
            }}
          >
            Toast de erro
          </Button>
        </div>
        <StateLabel>
          Dura 5 s, pausa com o mouse ou o foco em cima, e F8 leva o foco para as notificações.
        </StateLabel>
      </ComponentSection>

      <ComponentSection id="carregamento" title="Skeleton">
        <div aria-busy="true" className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex flex-col gap-3 rounded-lg border border-line p-4">
              <Skeleton className="aspect-3/2 w-full rounded-md" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-7 w-full" />
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
        <StateLabel>
          Aparece depois de 150 ms e pulsa em 1,2 s; com movimento reduzido fica parado. A região
          tem <code>aria-busy</code>.
        </StateLabel>
      </ComponentSection>

      <ComponentSection id="estados-vazios" title="Estado vazio">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-line">
            <EmptyState title="Nenhum evento por aqui ainda">
              Quando organizadores publicarem eventos, eles aparecem nesta página.
            </EmptyState>
          </div>
          <div className="rounded-lg border border-line">
            <EmptyState
              title="Você ainda não tem ingressos"
              action={
                <Button asChild>
                  <a href="#estados-vazios">Explorar eventos</a>
                </Button>
              }
            >
              Os ingressos que você comprar aparecem aqui e no seu e-mail.
            </EmptyState>
          </div>
        </div>
      </ComponentSection>
    </>
  );
}
