import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isDesignSystemEnabled } from "@/config/design-system";

import { ComponentsShowcase } from "./components-showcase";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/*
 * Every class below is written out in full so Tailwind generates it, and so a token
 * that stops resolving shows up here as a blank swatch. Values live in
 * @vira/ui/tokens.css; docs/DESIGN.md (section 2) documents their use.
 */

interface Swatch {
  readonly token: string;
  readonly className: string;
}

const BASE_COLOURS: readonly Swatch[] = [
  { token: "bg", className: "bg-bg" },
  { token: "surface", className: "bg-surface" },
  { token: "surface-sunken", className: "bg-surface-sunken" },
  { token: "ink", className: "bg-ink" },
  { token: "ink-muted", className: "bg-ink-muted" },
  { token: "ink-subtle", className: "bg-ink-subtle" },
  { token: "line", className: "bg-line" },
  { token: "line-strong", className: "bg-line-strong" },
  { token: "accent", className: "bg-accent" },
  { token: "accent-hover", className: "bg-accent-hover" },
  { token: "accent-pressed", className: "bg-accent-pressed" },
  { token: "accent-soft", className: "bg-accent-soft" },
  { token: "accent-ink", className: "bg-accent-ink" },
  { token: "on-accent", className: "bg-on-accent" },
  { token: "scrim", className: "bg-scrim" },
];

interface StatusPair {
  readonly token: string;
  readonly className: string;
  readonly example: string;
}

const STATUS_COLOURS: readonly StatusPair[] = [
  { token: "success", className: "bg-success-bg text-success", example: "Pagamento confirmado" },
  { token: "warning", className: "bg-warning-bg text-warning", example: "Últimos ingressos" },
  { token: "danger", className: "bg-danger-bg text-danger", example: "Check-in inválido" },
  { token: "info", className: "bg-info-bg text-info", example: "Evento de demonstração" },
];

interface TypeStyle {
  readonly token: string;
  readonly className: string;
}

const TYPE_SCALE: readonly TypeStyle[] = [
  { token: "display", className: "text-display" },
  { token: "display-sm", className: "text-display-sm" },
  { token: "h1", className: "text-h1" },
  { token: "h1-sm", className: "text-h1-sm" },
  { token: "h2", className: "text-h2" },
  { token: "h2-sm", className: "text-h2-sm" },
  { token: "h3", className: "text-h3" },
  { token: "body-lg", className: "text-body-lg" },
  { token: "body", className: "text-body" },
  { token: "body-sm", className: "text-body-sm" },
  { token: "label", className: "text-label" },
  { token: "overline", className: "text-overline uppercase" },
  { token: "price", className: "text-price tabular-nums" },
  { token: "price-lg", className: "text-price-lg tabular-nums" },
  { token: "logo", className: "text-logo" },
];

const SPACING: readonly {
  readonly step: string;
  readonly px: number;
  readonly className: string;
}[] = [
  { step: "0.5", px: 2, className: "w-0.5" },
  { step: "1", px: 4, className: "w-1" },
  { step: "2", px: 8, className: "w-2" },
  { step: "3", px: 12, className: "w-3" },
  { step: "4", px: 16, className: "w-4" },
  { step: "5", px: 20, className: "w-5" },
  { step: "6", px: 24, className: "w-6" },
  { step: "8", px: 32, className: "w-8" },
  { step: "10", px: 40, className: "w-10" },
  { step: "12", px: 48, className: "w-12" },
  { step: "16", px: 64, className: "w-16" },
  { step: "24", px: 96, className: "w-24" },
  { step: "32", px: 128, className: "w-32" },
];

const RADII: readonly { readonly token: string; readonly className: string }[] = [
  { token: "radius-sm", className: "rounded-sm" },
  { token: "radius-md", className: "rounded-md" },
  { token: "radius-lg", className: "rounded-lg" },
  { token: "radius-full", className: "rounded-full" },
];

const MOTION: readonly {
  readonly token: string;
  readonly className: string;
  readonly use: string;
}[] = [
  { token: "duration-fast", className: "duration-fast", use: "Hover, botão pressionado" },
  { token: "duration-base", className: "duration-base", use: "Dropdown, toast, seleção" },
  { token: "duration-slow", className: "duration-slow", use: "Modal, bottom sheet, card" },
  { token: "ease-exit", className: "ease-exit", use: "Saídas" },
];

const LAYERS: readonly { readonly token: string; readonly use: string }[] = [
  { token: "z-sticky", use: "Header, barra de compra mobile" },
  { token: "z-overlay", use: "Scrim" },
  { token: "z-modal", use: "Modal e bottom sheet" },
  { token: "z-dropdown", use: "Menu, select, popover e tooltip (acima do modal)" },
  { token: "z-toast", use: "Toast e link de pular conteúdo" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-12">
      <h2 id={id} className="mb-6 text-h2-sm md:text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TokenName({ children }: { children: ReactNode }) {
  return <code className="text-body-sm text-ink-muted">{children}</code>;
}

export default function DesignSystemPage() {
  if (!isDesignSystemEnabled(process.env)) notFound();

  return (
    <div className="mx-auto w-full max-w-page px-4 pb-24 sm:px-6 lg:px-8">
      <header className="pt-12 pb-12 md:pt-16">
        <p className="text-overline text-ink-muted uppercase">Desenvolvimento</p>
        <h1 className="mt-2 text-h1-sm md:text-h1">Design system</h1>
        <p className="mt-4 max-w-reading text-body-lg text-ink-muted">
          Tokens e componentes do pacote <code>@vira/ui</code>. Toda cor, tamanho, raio, sombra e
          movimento da interface vem daqui; o uso de cada um está no DESIGN.md.
        </p>
      </header>

      <Section id="cores" title="Cores">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {BASE_COLOURS.map(({ token, className }) => (
            <li key={token}>
              <div
                aria-hidden="true"
                className={`h-16 rounded-md border border-line ${className}`}
              />
              <TokenName>{token}</TokenName>
            </li>
          ))}
        </ul>

        <h3 className="mt-10 mb-4 text-h3">Estados</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {STATUS_COLOURS.map(({ token, className, example }) => (
            <li key={token} className={`rounded-md px-4 py-3 text-body ${className}`}>
              <span className="font-semibold">{token}</span>: {example}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="tipografia" title="Tipografia">
        <ul className="flex flex-col gap-6">
          {TYPE_SCALE.map(({ token, className }) => (
            <li key={token} className="flex flex-col gap-1">
              <TokenName>{token}</TokenName>
              <span className={className}>
                {token.startsWith("price") ? "R$ 120,00" : "Encontre seu próximo evento."}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="espacamento" title="Espaçamento">
        <ul className="flex flex-col gap-2">
          {SPACING.map(({ step, px, className }) => (
            <li key={step} className="flex items-center gap-4">
              <span className="w-24 shrink-0 text-body-sm text-ink-muted tabular-nums">
                {step} · {px}px
              </span>
              <span aria-hidden="true" className={`h-3 rounded-sm bg-accent ${className}`} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="raios-sombra" title="Raios e sombra">
        <ul className="flex flex-wrap gap-6">
          {RADII.map(({ token, className }) => (
            <li key={token} className="flex flex-col gap-2">
              <div
                aria-hidden="true"
                className={`size-20 border border-line-strong bg-surface ${className}`}
              />
              <TokenName>{token}</TokenName>
            </li>
          ))}
          <li className="flex flex-col gap-2">
            <div aria-hidden="true" className="size-20 rounded-lg bg-surface shadow-float" />
            <TokenName>shadow-float</TokenName>
          </li>
        </ul>
      </Section>

      <Section id="movimento" title="Movimento">
        <ul className="grid gap-3 sm:grid-cols-2">
          {MOTION.map(({ token, className, use }) => (
            <li key={token} className="rounded-md bg-surface px-4 py-3">
              <span className={`block text-label transition-colors ${className}`}>{token}</span>
              <span className="text-body-sm text-ink-muted">{use}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-6 inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-body font-semibold text-on-accent transition duration-fast hover:bg-accent-hover active:scale-98 active:bg-accent-pressed"
        >
          Botão de exemplo
        </button>
      </Section>

      <Section id="camadas" title="Camadas">
        <ul className="grid gap-3 sm:grid-cols-2">
          {LAYERS.map(({ token, use }) => (
            <li key={token} className="rounded-md bg-surface px-4 py-3">
              <span className="block text-label">{token}</span>
              <span className="text-body-sm text-ink-muted">{use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <ComponentsShowcase />
    </div>
  );
}
