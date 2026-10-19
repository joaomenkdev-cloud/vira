"use client";

import type { OrganizerEvent } from "@vira/shared";
import { Alert, Button, Icon } from "@vira/ui";
import { CircleCheck, Circle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { publishEvent } from "@/lib/api/organizer";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { publicationSteps } from "@/lib/organizer/event-state";

import { capitalize } from "./event-details-form";

export interface PublicationPanelProps {
  event: OrganizerEvent;
  onPublished: (event: OrganizerEvent) => void;
}

/**
 * What a draft still needs before it goes public, and the button that publishes it:
 * the one primary action of the page. The API has the last word; when it refuses, the
 * list it sends replaces the guess made here.
 */
export function PublicationPanel({ event, onPublished }: PublicationPanelProps) {
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState<{ title: string; items: string[] } | null>(null);
  const steps = publicationSteps(event);

  async function publish() {
    setPublishing(true);
    setProblem(null);
    try {
      onPublished(await publishEvent(event.id));
    } catch (error) {
      setProblem({
        title:
          error instanceof ApiError && error.code === "invalid-state-transition"
            ? "Ainda falta algo para publicar."
            : messageFor(error),
        items:
          error instanceof ApiError
            ? error.fieldErrors.map(({ message }) => capitalize(message))
            : [],
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section
      aria-labelledby="publicacao"
      className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-4 md:p-6"
    >
      <div className="flex flex-col gap-2">
        <h2 id="publicacao" className="text-h3">
          Publicação
        </h2>
        <p className="text-body-sm text-ink-muted">
          Um rascunho só você vê. Publicado, o evento aparece na vitrine e a página dele fica aberta
          a todos.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.path} className="flex items-start gap-2 text-body">
            <Icon
              icon={step.done ? CircleCheck : Circle}
              className={step.done ? "mt-0.5 text-success" : "mt-0.5 text-ink-muted"}
            />
            <span>
              {step.label}
              <span className="sr-only">{step.done ? ": feito" : ": falta"}</span>
              {step.done ? null : (
                <>
                  {" · "}
                  <a
                    href={`#${step.anchor}`}
                    className="text-body-sm text-ink-muted underline underline-offset-4"
                  >
                    Preencher
                  </a>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {problem ? (
        <Alert variant="danger" title={problem.title}>
          {problem.items.length > 0 ? (
            <ul className="list-disc pl-5">
              {problem.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      <Button
        size="lg"
        loading={publishing}
        loadingLabel="Publicando…"
        onClick={() => {
          void publish();
        }}
        className="w-full sm:w-auto sm:self-start"
      >
        Publicar evento
      </Button>
    </section>
  );
}

/** The state of an event that left the draft: where it is, or why it can no longer change. */
export function PublishedNotice({
  event,
  justPublished,
}: {
  event: OrganizerEvent;
  justPublished: boolean;
}) {
  return (
    <Alert
      variant="success"
      title={justPublished ? "Evento publicado." : "Este evento está publicado."}
    >
      <p>
        Ele aparece na vitrine e qualquer pessoa pode abrir a página dele.{" "}
        <Link href={`/eventos/${event.slug}`} className="underline underline-offset-4">
          Ver página do evento
        </Link>
      </p>
    </Alert>
  );
}
