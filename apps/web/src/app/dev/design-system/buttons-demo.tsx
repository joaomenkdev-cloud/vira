"use client";

import { Button, IconButton, Spinner, type ButtonVariant } from "@vira/ui";
import { Plus, Search, Trash2 } from "lucide-react";

import { ComponentSection, Group, StateLabel } from "./section";

const VARIANTS: readonly { variant: ButtonVariant; label: string }[] = [
  { variant: "primary", label: "Primário" },
  { variant: "secondary", label: "Secundário" },
  { variant: "ghost", label: "Fantasma" },
  { variant: "danger", label: "Perigo" },
  { variant: "link", label: "Link" },
];

/*
 * Hover, focus and pressed cannot be held still by the browser, so they are drawn here
 * with the same tokens the real states use (the `!` modifier wins over the base class).
 * The buttons stay interactive: hover and Tab to see the real thing.
 */
const HOVER: Record<ButtonVariant, string> = {
  primary: "bg-accent-hover!",
  secondary: "bg-surface-sunken!",
  ghost: "bg-surface-sunken!",
  danger: "bg-danger-bg!",
  link: "text-accent-ink!",
};

const PRESSED: Record<ButtonVariant, string> = {
  primary: "bg-accent-pressed! scale-98",
  secondary: "bg-surface-sunken! scale-98",
  ghost: "bg-line! scale-98",
  danger: "bg-danger-bg! scale-98",
  link: "text-accent-ink!",
};

const FOCUS = "outline-2 outline-offset-2 outline-accent";

export function ButtonsDemo() {
  return (
    <ComponentSection id="botoes" title="Botões">
      <Group title="Variantes e tamanhos">
        <ul className="flex flex-col gap-4">
          {VARIANTS.map(({ variant, label }) => (
            <li key={variant} className="flex flex-wrap items-center gap-4">
              <span className="w-28 text-body-sm text-ink-muted">{label}</span>
              {(["sm", "md", "lg"] as const).map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {label} {size}
                </Button>
              ))}
              {variant !== "link" ? (
                <Button variant={variant} iconStart={Plus}>
                  Com ícone
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Estados">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-x-4 border-spacing-y-3 text-left">
            <caption className="sr-only">Estados de cada variante de botão</caption>
            <thead>
              <tr>
                <th scope="col" className="text-body-sm font-normal text-ink-muted">
                  Variante
                </th>
                {["Padrão", "Hover", "Foco", "Pressionado", "Desabilitado", "Carregando"].map(
                  (state) => (
                    <th key={state} scope="col" className="text-body-sm font-normal text-ink-muted">
                      {state}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map(({ variant, label }) => (
                <tr key={variant}>
                  <th scope="row" className="text-body-sm font-normal text-ink-muted">
                    {label}
                  </th>
                  <td>
                    <Button variant={variant}>Padrão</Button>
                  </td>
                  <td>
                    <Button variant={variant} className={HOVER[variant]}>
                      Hover
                    </Button>
                  </td>
                  <td>
                    <Button variant={variant} className={FOCUS}>
                      Foco
                    </Button>
                  </td>
                  <td>
                    <Button variant={variant} className={PRESSED[variant]}>
                      Pressionado
                    </Button>
                  </td>
                  <td>
                    <Button variant={variant} disabled>
                      Desabilitado
                    </Button>
                  </td>
                  <td>
                    <Button variant={variant} loading loadingLabel="Processando…">
                      Pagar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group title="Largura total no celular">
        <div className="max-w-sm">
          <Button size="lg" className="w-full">
            Comprar ingresso
          </Button>
        </div>
      </Group>

      <Group title="Só com ícone">
        <ul className="flex flex-wrap items-center gap-4">
          {(["sm", "md", "lg"] as const).map((size) => (
            <li key={size}>
              <IconButton
                icon={Search}
                label={`Buscar (${size})`}
                size={size}
                variant="secondary"
              />
            </li>
          ))}
          <li>
            <IconButton icon={Plus} label="Adicionar" variant="primary" />
          </li>
          <li>
            <IconButton icon={Trash2} label="Excluir" variant="danger" />
          </li>
          <li>
            <IconButton icon={Search} label="Buscar (desabilitado)" disabled />
          </li>
        </ul>
        <StateLabel>
          Passe o mouse ou use Tab para ver o tooltip com o nome de cada botão.
        </StateLabel>
      </Group>

      <Group title="Spinner">
        <ul className="flex flex-wrap items-center gap-6">
          {([16, 20, 24] as const).map((size) => (
            <li key={size} className="flex items-center gap-2">
              <Spinner size={size} label={`Carregando (${size}px)`} />
              <StateLabel>{size}px</StateLabel>
            </li>
          ))}
        </ul>
      </Group>
    </ComponentSection>
  );
}
