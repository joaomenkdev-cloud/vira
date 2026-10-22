"use client";

import type { OrganizerEvent } from "@vira/shared";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  EmptyState,
  Icon,
  Skeleton,
  SkeletonText,
} from "@vira/ui";
import { ChevronLeft, ScanLine } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";

import { EventDescription } from "@/components/catalog/event-description";
import { CancelEvent, DeleteDraft } from "@/components/organizer/event-danger-zone";
import { EventDetailsForm } from "@/components/organizer/event-details-form";
import { EventImageSection } from "@/components/organizer/event-image-section";
import { OrganizerGate } from "@/components/organizer/organizer-gate";
import { PublicationPanel, PublishedNotice } from "@/components/organizer/publication-panel";
import { TicketTypesSection } from "@/components/organizer/ticket-types-section";
import { getOrganizerEvent, updateEvent } from "@/lib/api/organizer";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { formatDateRange } from "@/lib/format";
import { lockedReason, PHASE_BADGES, phaseOf } from "@/lib/organizer/event-state";

type Load =
  | { status: "loading" }
  | { status: "ready"; event: OrganizerEvent }
  | { status: "not-found" }
  | { status: "failed"; message: string };

async function fetchEvent(id: string): Promise<Load> {
  try {
    return { status: "ready", event: await getOrganizerEvent(id) };
  } catch (error) {
    // Someone else's event and a malformed id look the same as one that does not exist.
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return { status: "not-found" };
    }
    return { status: "failed", message: messageFor(error) };
  }
}

function BackLink() {
  return (
    <Link
      href="/painel"
      className="inline-flex min-h-11 items-center gap-1 text-label text-ink-muted hover:text-ink"
    >
      <Icon icon={ChevronLeft} size={16} />
      Meus eventos
    </Link>
  );
}

function EditorSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Carregando o evento…
      </p>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-11 w-3/4" />
      <SkeletonText lines={2} />
      <Skeleton className="mt-6 h-48 w-full rounded-lg" />
    </div>
  );
}

export function EventEditor({ id }: { id: string }) {
  return <OrganizerGate skeleton={<EditorSkeleton />}>{() => <Editor id={id} />}</OrganizerGate>;
}

function Editor({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [justPublished, setJustPublished] = useState(false);

  useEffect(() => {
    void fetchEvent(id).then(setLoad);
  }, [id]);

  const show = useCallback((event: OrganizerEvent) => {
    setLoad({ status: "ready", event });
  }, []);

  const reload = useCallback(async () => {
    const next = await fetchEvent(id);
    // A failed reload keeps what is on screen; the action that asked for it said so already.
    if (next.status === "ready") setLoad(next);
  }, [id]);

  if (load.status === "loading") return <EditorSkeleton />;

  if (load.status === "not-found") {
    return (
      <>
        <BackLink />
        <EmptyState
          headingLevel={2}
          title="Evento não encontrado"
          action={
            <Button asChild variant="secondary">
              <Link href="/painel">Ver meus eventos</Link>
            </Button>
          }
        >
          Ele pode ter sido excluído, ou o endereço está incompleto.
        </EmptyState>
      </>
    );
  }

  if (load.status === "failed") {
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <Alert variant="danger" title="Não foi possível carregar o evento.">
          {load.message}
        </Alert>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            setLoad({ status: "loading" });
            void fetchEvent(id).then(setLoad);
          }}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  const { event } = load;
  const phase = phaseOf(event);
  const badge = PHASE_BADGES[phase];
  const locked = lockedReason(event);

  return (
    <div className="flex flex-col">
      <BackLink />
      <header className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {event.isDemo ? <Badge>Demonstração</Badge> : null}
        </div>
        <h1 className="text-h1-sm text-balance md:text-h1">{event.title}</h1>
        <p className="text-body text-ink-muted">
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
        </p>
        {phase === "PUBLISHED" || phase === "ENDED" ? (
          <Link
            href={`/painel/eventos/${encodeURIComponent(event.id)}/check-in`}
            className={buttonClassName("secondary", "md", "self-start")}
          >
            <Icon icon={ScanLine} />
            Abrir check-in
          </Link>
        ) : null}
      </header>

      <div className="mt-8">
        {phase === "DRAFT" ? (
          <PublicationPanel
            event={event}
            onPublished={(published) => {
              setJustPublished(true);
              show(published);
            }}
          />
        ) : phase === "PUBLISHED" ? (
          <PublishedNotice event={event} justPublished={justPublished} />
        ) : (
          <Alert variant={phase === "CANCELED" ? "danger" : "info"} title={locked}>
            {event.cancelReason ? <p>Motivo informado: {event.cancelReason}</p> : null}
          </Alert>
        )}
      </div>

      <div className="mt-6 flex flex-col divide-y divide-line">
        <EditorSection id="detalhes" title="Detalhes">
          <EventDetailsForm
            event={event}
            readOnly={locked !== null}
            submitLabel="Salvar detalhes"
            submittingLabel="Salvando…"
            onSubmit={async (body) => {
              show(await updateEvent(event.id, { ...body, venue: body.venue ?? null }));
            }}
          >
            {event.descriptionHtml ? (
              <details className="rounded-md border border-line bg-surface p-4">
                <summary className="min-h-11 cursor-pointer content-center text-label text-ink">
                  Prévia da descrição salva
                </summary>
                <EventDescription html={event.descriptionHtml} />
              </details>
            ) : null}
          </EventDetailsForm>
        </EditorSection>

        <EditorSection
          id="imagem"
          title="Imagem"
          description="A foto é a maior coisa da página do evento e aparece também no card da vitrine."
        >
          <EventImageSection event={event} readOnly={locked !== null} onUpdated={show} />
        </EditorSection>

        <EditorSection
          id="ingressos"
          title="Ingressos"
          description="Os tipos aparecem para o público nesta ordem."
        >
          <TicketTypesSection event={event} readOnly={locked !== null} onChanged={reload} />
        </EditorSection>

        {phase === "DRAFT" || phase === "PUBLISHED" ? (
          <EditorSection
            id="zona-de-cuidado"
            title={phase === "DRAFT" ? "Excluir" : "Cancelar"}
            description={
              phase === "DRAFT"
                ? "Um rascunho pode ser apagado. Depois de publicado, um evento só pode ser cancelado."
                : "Cancelar para as vendas e avisa na página do evento que ele não vai acontecer."
            }
          >
            {phase === "DRAFT" ? (
              <DeleteDraft event={event} />
            ) : (
              <CancelEvent event={event} onCanceled={show} />
            )}
          </EditorSection>
        ) : null}
      </div>
    </div>
  );
}

function EditorSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section id={id} aria-labelledby={titleId} className="flex flex-col gap-6 py-10">
      <div className="flex flex-col gap-2">
        <h2 id={titleId} className="text-h2-sm md:text-h2">
          {title}
        </h2>
        {description ? <p className="text-body text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
