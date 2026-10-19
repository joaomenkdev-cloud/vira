"use client";

import {
  MAX_PER_ORDER_DEFAULT,
  TICKET_TYPE_DESCRIPTION_MAX_LENGTH,
  TICKET_TYPE_NAME_MAX_LENGTH,
  type OrganizerEvent,
  type TicketTypeBody,
} from "@vira/shared";
import { Alert, Button, Input, Modal, ModalClose, ModalContent, Textarea } from "@vira/ui";
import { useId, useState, type ReactNode, type SubmitEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { createTicketType, updateTicketType } from "@/lib/api/organizer";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { formatCents, parsePriceToCents } from "@/lib/organizer/money";
import {
  parseWholeNumber,
  salesWindowValidators,
  validateCapacity,
  validateMaxPerOrder,
  validatePrice,
  validateTicketDescription,
  validateTicketName,
} from "@/lib/organizer/validation";
import { isoToWallTime, wallTimeToIso } from "@/lib/organizer/wall-time";

const FIELDS = [
  "name",
  "price",
  "capacity",
  "maxPerOrder",
  "salesStartAt",
  "salesEndAt",
  "description",
] as const;
type Field = (typeof FIELDS)[number];

const API_PATHS: Readonly<Record<string, Field>> = {
  name: "name",
  description: "description",
  priceCents: "price",
  capacity: "capacity",
  maxPerOrder: "maxPerOrder",
  salesStartAt: "salesStartAt",
  salesEndAt: "salesEndAt",
};

export interface TicketTypeDialogProps {
  event: OrganizerEvent;
  /** The ticket type being edited; absent when adding one. */
  ticketType?: TicketTypeBody;
  /** The button that opens the dialog. */
  trigger: ReactNode;
  /** Called after the API saved it, so the page reloads the event. */
  onSaved: () => Promise<void>;
}

/**
 * Adds or edits a ticket type (docs/API.md, N8) in a modal: a bottom sheet on a phone.
 * Sales dates are optional and read on the event's clock, like the event's own dates.
 */
export function TicketTypeDialog({ event, ticketType, trigger, onSaved }: TicketTypeDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Modal open={open} onOpenChange={setOpen}>
      {trigger}
      {open ? (
        <ModalContent
          size="md"
          title={ticketType ? `Editar “${ticketType.name}”` : "Novo tipo de ingresso"}
        >
          <TicketTypeForm
            event={event}
            {...(ticketType ? { ticketType } : {})}
            onSaved={async () => {
              await onSaved();
              setOpen(false);
            }}
          />
        </ModalContent>
      ) : null}
    </Modal>
  );
}

function TicketTypeForm({ event, ticketType, onSaved }: Omit<TicketTypeDialogProps, "trigger">) {
  const zone = event.timezone;
  const eventEnd = isoToWallTime(event.endsAt, zone);
  const sales = salesWindowValidators(eventEnd);
  const form = useForm<Field>({
    name: validateTicketName,
    price: validatePrice,
    capacity: validateCapacity,
    maxPerOrder: validateMaxPerOrder,
    salesStartAt: sales.salesStartAt,
    salesEndAt: sales.salesEndAt,
    description: validateTicketDescription,
  });
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const committed = ticketType ? ticketType.sold + ticketType.reserved : 0;
  const salesHintId = useId();

  async function handleSubmit(submitEvent: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(submitEvent);
    setProblem(null);
    if (values === null) return;

    const priceCents = parsePriceToCents(values.price);
    const capacity = parseWholeNumber(values.capacity, 1, Number.MAX_SAFE_INTEGER);
    const maxPerOrder = parseWholeNumber(values.maxPerOrder, 1, Number.MAX_SAFE_INTEGER);
    if (priceCents === null || capacity === null || maxPerOrder === null) return;
    const salesStartAt = values.salesStartAt ? wallTimeToIso(values.salesStartAt, zone) : null;
    const salesEndAt = values.salesEndAt ? wallTimeToIso(values.salesEndAt, zone) : null;
    const description = values.description.trim();

    setSubmitting(true);
    try {
      if (ticketType) {
        await updateTicketType(ticketType.id, {
          name: values.name.trim(),
          description: description === "" ? null : description,
          priceCents,
          capacity,
          maxPerOrder,
          salesStartAt,
          salesEndAt,
        });
      } else {
        await createTicketType(event.id, {
          name: values.name.trim(),
          ...(description === "" ? {} : { description }),
          priceCents,
          capacity,
          maxPerOrder,
          ...(salesStartAt ? { salesStartAt } : {}),
          ...(salesEndAt ? { salesEndAt } : {}),
        });
      }
      await onSaved();
    } catch (error) {
      setProblem(messageFor(error));
      if (error instanceof ApiError && error.code === "validation-failed") {
        const field = error.fieldErrors.map(({ path }) => API_PATHS[path]).find(Boolean);
        if (field) form.setFieldError(field, "Confira este campo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(submitEvent) => void handleSubmit(submitEvent)}
      className="flex flex-col gap-6"
    >
      <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
      {problem ? <Alert variant="danger" title={problem} /> : null}
      <Input
        {...form.field("name")}
        label="Nome"
        placeholder="Ex.: Pista – Lote 1"
        defaultValue={ticketType?.name}
        maxLength={TICKET_TYPE_NAME_MAX_LENGTH}
        fieldSize="md"
      />
      <div className="grid gap-6 sm:grid-cols-3">
        <Input
          {...form.field("price")}
          label="Preço (R$)"
          placeholder="80,00"
          inputMode="decimal"
          defaultValue={ticketType ? formatCents(ticketType.price.amountCents) : undefined}
          fieldSize="md"
        />
        <Input
          {...form.field("capacity")}
          label="Quantidade"
          inputMode="numeric"
          hint={
            committed > 0
              ? `Mínimo de ${String(committed)} (já vendidos ou reservados).`
              : undefined
          }
          defaultValue={ticketType ? String(ticketType.capacity) : undefined}
          fieldSize="md"
        />
        <Input
          {...form.field("maxPerOrder")}
          label="Máximo por pedido"
          inputMode="numeric"
          defaultValue={String(ticketType?.maxPerOrder ?? MAX_PER_ORDER_DEFAULT)}
          fieldSize="md"
        />
      </div>
      <fieldset aria-describedby={salesHintId} className="flex flex-col gap-4">
        <legend className="mb-1 text-label text-ink">Período de vendas</legend>
        <p id={salesHintId} className="text-body-sm text-ink-muted">
          Opcional. Sem datas, as vendas ficam abertas da publicação até o fim do evento.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <Input
            {...form.field("salesStartAt")}
            type="datetime-local"
            label="Abrem em"
            optional
            defaultValue={
              ticketType?.salesStartAt ? isoToWallTime(ticketType.salesStartAt, zone) : undefined
            }
            fieldSize="md"
          />
          <Input
            {...form.field("salesEndAt")}
            type="datetime-local"
            label="Fecham em"
            optional
            defaultValue={
              ticketType?.salesEndAt ? isoToWallTime(ticketType.salesEndAt, zone) : undefined
            }
            fieldSize="md"
          />
        </div>
      </fieldset>
      <Textarea
        {...form.field("description")}
        label="Descrição"
        optional
        hint="Uma frase sobre o que este ingresso dá direito."
        defaultValue={ticketType?.description ?? undefined}
        maxLength={TICKET_TYPE_DESCRIPTION_MAX_LENGTH}
        rows={3}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <ModalClose asChild>
          <Button variant="secondary">Cancelar</Button>
        </ModalClose>
        <Button type="submit" loading={submitting} loadingLabel="Salvando…">
          {ticketType ? "Salvar tipo de ingresso" : "Adicionar tipo de ingresso"}
        </Button>
      </div>
    </form>
  );
}
