"use client";

import { CANCEL_REASON_MAX_LENGTH, type OrganizerEvent } from "@vira/shared";
import { Alert, Button, Modal, ModalClose, ModalContent, ModalTrigger, Textarea } from "@vira/ui";
import { useRouter } from "next/navigation";
import { useId, useState, type SubmitEvent } from "react";

import { cancelEvent, deleteEvent } from "@/lib/api/organizer";
import { messageFor } from "@/lib/api/messages";
import { validateCancelReason } from "@/lib/organizer/validation";

/** Deletes a draft, with its ticket types. A published event is canceled instead. */
export function DeleteDraft({ event }: { event: OrganizerEvent }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setProblem(null);
    try {
      await deleteEvent(event.id);
      router.replace("/painel");
    } catch (error) {
      setProblem(messageFor(error));
      setDeleting(false);
    }
  }

  return (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="danger" className="self-start">
          Excluir rascunho
        </Button>
      </ModalTrigger>
      <ModalContent
        title="Excluir este rascunho?"
        description={`“${event.title}” e os tipos de ingresso dele serão apagados. Isso não pode ser desfeito.`}
        footer={
          <>
            <ModalClose asChild>
              <Button variant="secondary">Manter rascunho</Button>
            </ModalClose>
            <Button
              variant="danger"
              loading={deleting}
              loadingLabel="Excluindo…"
              onClick={() => {
                void remove();
              }}
            >
              Excluir rascunho
            </Button>
          </>
        }
      >
        {problem ? <Alert variant="danger" title={problem} /> : null}
      </ModalContent>
    </Modal>
  );
}

/**
 * Cancels a published event for good (docs/API.md, N8). The reason is shown to whoever
 * bought a ticket; the storefront keeps the page, saying it was canceled.
 */
export function CancelEvent({
  event,
  onCanceled,
}: {
  event: OrganizerEvent;
  onCanceled: (event: OrganizerEvent) => void;
}) {
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  async function handleSubmit(submitEvent: SubmitEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    const typed = new FormData(submitEvent.currentTarget).get("reason");
    const reason = typeof typed === "string" ? typed : "";
    const message = validateCancelReason(reason);
    setError(message);
    setProblem(null);
    if (message !== undefined) {
      document.getElementById(reasonId)?.focus();
      return;
    }
    setCanceling(true);
    try {
      const canceled = await cancelEvent(event.id, { reason: reason.trim() });
      setOpen(false);
      onCanceled(canceled);
    } catch (failure) {
      setProblem(messageFor(failure));
    } finally {
      setCanceling(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={setOpen}>
      <ModalTrigger asChild>
        <Button variant="danger" className="self-start">
          Cancelar evento
        </Button>
      </ModalTrigger>
      <ModalContent
        title="Cancelar este evento?"
        description="O cancelamento é definitivo: as vendas param e a página do evento passa a dizer que ele foi cancelado."
      >
        <form
          method="post"
          noValidate
          onSubmit={(submitEvent) => void handleSubmit(submitEvent)}
          className="flex flex-col gap-6"
        >
          {problem ? <Alert variant="danger" title={problem} /> : null}
          <Textarea
            id={reasonId}
            name="reason"
            label="Motivo"
            hint="Quem comprou ingresso vai ler este texto."
            maxLength={CANCEL_REASON_MAX_LENGTH}
            rows={3}
            error={error}
            onChange={() => {
              setError(undefined);
            }}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <ModalClose asChild>
              <Button variant="secondary">Manter evento</Button>
            </ModalClose>
            <Button type="submit" variant="danger" loading={canceling} loadingLabel="Cancelando…">
              Cancelar evento
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
