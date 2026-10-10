"use client";

import {
  Checkbox,
  Input,
  PasswordInput,
  QuantityStepper,
  Radio,
  RadioGroup,
  SearchInput,
  Select,
  Textarea,
} from "@vira/ui";
import { useState } from "react";

import { ComponentSection, Group, StateLabel } from "./section";

const TICKET_TYPES = [
  { value: "pista", label: "Pista" },
  { value: "camarote", label: "Camarote" },
  { value: "vip", label: "Área VIP (esgotado)", disabled: true },
] as const;

/* Hover and focus drawn with the real tokens; the fields themselves stay interactive. */
const HOVER_FIELD = "[&_input]:border-ink-muted!";
const FOCUS_FIELD =
  "[&_input]:border-ink! [&_input]:outline-2 [&_input]:outline-offset-2 [&_input]:outline-accent";

export function FormsDemo() {
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState(2);

  return (
    <ComponentSection id="campos" title="Campos de formulário">
      <Group title="Texto: estados">
        <div className="grid gap-6 md:grid-cols-2">
          <Input label="Padrão" placeholder="Maria Souza" autoComplete="name" />
          <Input label="Hover" placeholder="Maria Souza" className={HOVER_FIELD} />
          <Input label="Foco" placeholder="Maria Souza" className={FOCUS_FIELD} />
          <Input label="Preenchido" defaultValue="Maria Souza" autoComplete="name" />
          <Input label="Com ajuda" hint="Como aparece no ingresso." placeholder="Maria Souza" />
          <Input
            label="Com erro"
            defaultValue="maria@"
            type="email"
            error="Informe um e-mail válido, como nome@exemplo.com."
          />
          <Input label="Desabilitado" defaultValue="Maria Souza" disabled />
          <Input label="Telefone" optional type="tel" placeholder="(11) 91234-5678" />
        </div>
      </Group>

      <Group title="Variações">
        <div className="grid gap-6 md:grid-cols-2">
          <Input label="E-mail" type="email" placeholder="nome@exemplo.com" />
          <PasswordInput label="Senha" hint="Pelo menos 12 caracteres." />
          <PasswordInput
            label="Senha com erro"
            autoComplete="new-password"
            error="A senha é curta demais."
          />
          <SearchInput
            label="Buscar eventos"
            placeholder="Buscar eventos"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            onClear={() => {
              setSearch("");
            }}
          />
          <Input label="Data" type="date" />
          <Input label="Hora" type="time" />
          <Input label="Altura 44 px (painel)" fieldSize="md" placeholder="Maria Souza" />
          <Select
            label="Tipo de ingresso"
            placeholder="Escolha um tipo"
            options={TICKET_TYPES}
            hint="Tipos esgotados não podem ser escolhidos."
          />
          <Select
            label="Select com erro"
            placeholder="Escolha um tipo"
            options={TICKET_TYPES}
            error="Escolha um tipo de ingresso."
          />
          <Select
            label="Select desabilitado"
            options={TICKET_TYPES}
            defaultValue="pista"
            disabled
          />
          <Textarea
            className="md:col-span-2"
            label="Descrição do evento"
            hint="Aceita Markdown."
            placeholder="Conte o que o público vai encontrar."
          />
          <Textarea
            className="md:col-span-2"
            label="Textarea com erro"
            defaultValue="Curto"
            error="Escreva ao menos 20 caracteres."
          />
        </div>
      </Group>

      <Group title="Caixa de seleção">
        <div className="flex flex-col gap-2">
          <Checkbox label="Desmarcada" />
          <Checkbox label="Marcada" defaultChecked />
          <Checkbox label="Mista" indeterminate />
          <Checkbox label="Com descrição" description="No máximo um e-mail por mês." />
          <Checkbox label="Com erro" error="É preciso aceitar os termos." />
          <Checkbox label="Desabilitada" disabled />
          <Checkbox label="Desabilitada e marcada" disabled defaultChecked />
        </div>
      </Group>

      <Group title="Escolha única">
        <div className="grid gap-6 md:grid-cols-2">
          <RadioGroup legend="Forma de entrega" defaultValue="email">
            <Radio value="email" label="Por e-mail" description="Chega em instantes." />
            <Radio value="app" label="No aplicativo" />
            <Radio value="balcao" label="No balcão" disabled />
          </RadioGroup>
          <RadioGroup legend="Grupo com erro" error="Escolha uma forma de entrega.">
            <Radio value="email" label="Por e-mail" />
            <Radio value="app" label="No aplicativo" />
          </RadioGroup>
        </div>
      </Group>

      <Group title="Quantidade">
        <ul className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <li className="flex items-center gap-4">
            <QuantityStepper
              label="Pista"
              value={quantity}
              onValueChange={setQuantity}
              min={0}
              max={4}
            />
            <StateLabel>Valor {quantity} · mínimo 0 · máximo 4 (anunciado ao alterar)</StateLabel>
          </li>
          <li className="flex items-center gap-4">
            <QuantityStepper label="No mínimo" defaultValue={0} max={4} />
            <StateLabel>No mínimo</StateLabel>
          </li>
          <li className="flex items-center gap-4">
            <QuantityStepper label="No máximo" defaultValue={4} max={4} />
            <StateLabel>No máximo</StateLabel>
          </li>
          <li className="flex items-center gap-4">
            <QuantityStepper label="Desabilitado" defaultValue={1} disabled />
            <StateLabel>Desabilitado</StateLabel>
          </li>
        </ul>
      </Group>
    </ComponentSection>
  );
}
