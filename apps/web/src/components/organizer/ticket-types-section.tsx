"use client";

import type { OrganizerEvent, TicketTypeBody } from "@vira/shared";
import { Alert, Button, EmptyState, Modal, ModalClose, ModalContent, ModalTrigger } from "@vira/ui";
import { Plus } from "lucide-react";
import { useState } from "react";

import { deleteTicketType } from "@/lib/api/organizer";
import { messageFor } from "@/lib/api/messages";
import { formatDayAndTime, formatPrice } from "@/lib/format";

import { TicketTypeDialog } from "./ticket-type-dialog";

export interface TicketTypesSectionProps {
  event: OrganizerEvent;
  readOnly: boolean;
  /** Reloads the event after a change, so every section sees the same ticket types. */
  onChanged: () => Promise<void>;
}

/** The ticket types of the event, in the order the public sees them, with their sales. */
export function TicketTypesSection({ event, readOnly, onChanged }: TicketTypesSectionProps) {
  const [problem, setProblem] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {problem ? <Alert variant="danger" title={problem} /> : null}
      {event.ticketTypes.length === 0 ? (
        <EmptyState title="Nenhum tipo de ingresso ainda" className="py-8">
          Crie ao menos um para publicar: pista, camarote, meia-entrada…
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {event.ticketTypes.map((ticketType) => (
            <li
              key={ticketType.id}
              className="flex flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between md:p-5"
            >
              <TicketTypeSummary ticketType={ticketType} timeZone={event.timezone} />
              {readOnly ? null : (
                <div className="flex shrink-0 gap-2">
                  <TicketTypeDialog
                    event={event}
                    ticketType={ticketType}
                    onSaved={onChanged}
                    trigger={
                      <ModalTrigger asChild>
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Editar ${ticketType.name}`}
                        >
                          Editar
                        </Button>
                      </ModalTrigger>
                    }
                  />
                  <DeleteTicketType
                    ticketType={ticketType}
                    onDeleted={async () => {
                      setProblem(null);
                      await onChanged();
                    }}
                    onFailed={setProblem}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <TicketTypeDialog
          event={event}
          onSaved={onChanged}
          trigger={
            <ModalTrigger asChild>
              <Button variant="secondary" className="self-start" iconStart={Plus}>
                Adicionar tipo de ingresso
              </Button>
            </ModalTrigger>
          }
        />
      )}
    </div>
  );
}

function TicketTypeSummary({
  ticketType,
  timeZone,
}: {
  ticketType: TicketTypeBody;
  timeZone: string;
}) {
  const sales = salesWindow(ticketType, timeZone);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-body font-semibold text-ink">{ticketType.name}</span>
        <span className="text-body font-semibold text-ink tabular-nums">
          {formatPrice(ticketType.price)}
        </span>
      </p>
      {ticketType.description ? (
        <p className="text-body-sm text-ink-muted">{ticketType.description}</p>
      ) : null}
      <p className="text-body-sm text-ink-muted tabular-nums">
        {ticketType.sold.toLocaleString("pt-BR")} vendidos de{" "}
        {ticketType.capacity.toLocaleString("pt-BR")}
        {ticketType.reserved > 0
          ? ` · ${ticketType.reserved.toLocaleString("pt-BR")} reservados`
          : ""}{" "}
        · até {String(ticketType.maxPerOrder)} por pedido
      </p>
      {sales ? <p className="text-body-sm text-ink-muted">{sales}</p> : null}
    </div>
  );
}

/** "Vendas de 10/03 às 12:00 até 14/03 às 18:00", or nothing when the window is open. */
function salesWindow(ticketType: TicketTypeBody, timeZone: string): string | null {
  const { salesStartAt: start, salesEndAt: end } = ticketType;
  if (start && end) {
    return `Vendas de ${formatDayAndTime(start, timeZone)} até ${formatDayAndTime(end, timeZone)}`;
  }
  if (start) return `Vendas a partir de ${formatDayAndTime(start, timeZone)}`;
  if (end) return `Vendas até ${formatDayAndTime(end, timeZone)}`;
  return null;
}

function DeleteTicketType({
  ticketType,
  onDeleted,
  onFailed,
}: {
  ticketType: TicketTypeBody;
  onDeleted: () => Promise<void>;
  onFailed: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await deleteTicketType(ticketType.id);
      setOpen(false);
      await onDeleted();
    } catch (error) {
      setOpen(false);
      onFailed(messageFor(error));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Excluir ${ticketType.name}`}>
          Excluir
        </Button>
      </ModalTrigger>
      <ModalContent
        title={`Excluir “${ticketType.name}”?`}
        description="Só dá para excluir um tipo de ingresso sem vendas nem reservas."
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary">Manter</Button>
            </ModalClose>
            <Button
              variant="danger"
              loading={deleting}
              loadingLabel="Excluindo…"
              onClick={() => {
                void remove();
              }}
            >
              Excluir
            </Button>
          </>
        }
      />
    </Modal>
  );
}
