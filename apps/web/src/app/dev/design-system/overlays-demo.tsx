"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  ModalTrigger,
  Select,
} from "@vira/ui";
import { ChevronDown, Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { ComponentSection, Group, StateLabel } from "./section";

const SORT_OPTIONS = [
  { value: "data", label: "Data" },
  { value: "preco", label: "Menor preço" },
  { value: "nome", label: "Nome" },
] as const;

export function OverlaysDemo() {
  const [sort, setSort] = useState("data");

  return (
    <ComponentSection id="sobreposicoes" title="Modal e menus">
      <Group title="Modal e bottom sheet">
        <div className="flex flex-wrap gap-3">
          <Modal>
            <ModalTrigger asChild>
              <Button variant="danger">Confirmação (480 px)</Button>
            </ModalTrigger>
            <ModalContent
              title="Excluir este evento?"
              description="Esta ação não pode ser desfeita."
              footer={
                <>
                  <ModalClose asChild>
                    <Button variant="secondary">Cancelar</Button>
                  </ModalClose>
                  <ModalClose asChild>
                    <Button variant="danger">Excluir evento</Button>
                  </ModalClose>
                </>
              }
            >
              <p className="text-body">O evento e seus tipos de ingresso deixam de aparecer.</p>
            </ModalContent>
          </Modal>

          <Modal>
            <ModalTrigger asChild>
              <Button variant="secondary">Conteúdo (640 px)</Button>
            </ModalTrigger>
            <ModalContent
              size="md"
              title="Dados do titular"
              description="Aparecem no ingresso."
              footer={
                <>
                  <ModalClose asChild>
                    <Button variant="secondary">Cancelar</Button>
                  </ModalClose>
                  <ModalClose asChild>
                    <Button>Salvar</Button>
                  </ModalClose>
                </>
              }
            >
              <div className="flex flex-col gap-4">
                <Input label="Nome completo" autoComplete="name" />
                <Select
                  label="Tipo de ingresso"
                  placeholder="Escolha um tipo"
                  options={[
                    { value: "pista", label: "Pista" },
                    { value: "camarote", label: "Camarote" },
                  ]}
                />
              </div>
            </ModalContent>
          </Modal>
        </div>
        <StateLabel>
          Abaixo de 640 px o modal vira um bottom sheet. Tab fica preso dentro, Esc fecha e o foco
          volta para o botão. O select de dentro abre por cima do modal.
        </StateLabel>
      </Group>

      <Group title="Menu suspenso">
        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                Ações
                <ChevronDown aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Evento</DropdownMenuLabel>
              <DropdownMenuItem icon={Pencil}>Editar</DropdownMenuItem>
              <DropdownMenuItem icon={Copy} disabled>
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Trash2} destructive>
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                Ordenar por: {SORT_OPTIONS.find((option) => option.value === sort)?.label}
                <ChevronDown aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                {SORT_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <StateLabel>
          Setas, Home, End e a primeira letra navegam; Esc fecha e devolve o foco. O item escolhido
          mostra um check à direita.
        </StateLabel>
      </Group>
    </ComponentSection>
  );
}
