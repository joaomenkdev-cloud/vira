"use client";

import { Icon, Skeleton } from "@vira/ui";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EventDetailsForm } from "@/components/organizer/event-details-form";
import { OrganizerGate } from "@/components/organizer/organizer-gate";
import { createEvent } from "@/lib/api/organizer";

/**
 * A new event starts as a draft with its details; the picture and the ticket types come
 * next, on the event's page, where it is also published.
 */
export function NewEventView() {
  const router = useRouter();

  return (
    <>
      <Link
        href="/painel"
        className="inline-flex min-h-11 items-center gap-1 text-label text-ink-muted hover:text-ink"
      >
        <Icon icon={ChevronLeft} size={16} />
        Meus eventos
      </Link>
      <h1 className="mt-4 text-h1-sm md:text-h1">Criar evento</h1>
      <p className="mt-3 text-body text-ink-muted">
        Comece pelos detalhes. Depois você adiciona a imagem e os ingressos; nada fica público até
        você publicar.
      </p>
      <div className="mt-10">
        <OrganizerGate
          skeleton={
            <div aria-busy="true" className="flex flex-col gap-6">
              <p role="status" className="sr-only">
                Carregando…
              </p>
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          }
        >
          {() => (
            <EventDetailsForm
              primary
              submitLabel="Criar rascunho"
              submittingLabel="Criando…"
              onSubmit={async (body) => {
                const event = await createEvent(body);
                router.push(`/painel/eventos/${event.id}`);
              }}
            />
          )}
        </OrganizerGate>
      </div>
    </>
  );
}
