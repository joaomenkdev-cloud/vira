"use client";

import { EVENT_IMAGE_ALT_MAX_LENGTH, type OrganizerEvent } from "@vira/shared";
import { Alert, Button, Field, Input } from "@vira/ui";
import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";

import { EventImage } from "@/components/catalog/event-image";
import { uploadEventImage } from "@/lib/api/organizer";
import { messageFor } from "@/lib/api/messages";
import { checkImageFile } from "@/lib/organizer/image-file";
import { validateImageAlt } from "@/lib/organizer/validation";

export interface EventImageSectionProps {
  event: OrganizerEvent;
  readOnly: boolean;
  onUpdated: (event: OrganizerEvent) => void;
}

/**
 * The event's picture and its text alternative (docs/API.md, "Imagem do evento"). The
 * file goes from the browser straight to the bucket; the API then checks it, removes
 * its metadata and keeps a WebP. A new one replaces the old, even after publishing.
 */
export function EventImageSection({ event, readOnly, onUpdated }: EventImageSectionProps) {
  const fileId = useId();
  const altId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [altError, setAltError] = useState<string | undefined>();
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  // The preview is a blob: address of the chosen file, released when replaced or left.
  const previewUrl = useRef<string | null>(null);
  function showPreview(chosen: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = chosen ? URL.createObjectURL(chosen) : null;
    setPreview(previewUrl.current);
  }
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  async function choose(chosen: File | null) {
    setDone(false);
    setProblem(null);
    setFile(chosen);
    showPreview(chosen);
    setFileError(chosen ? await checkImageFile(chosen) : undefined);
  }

  async function handleSubmit(submitEvent: SubmitEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    setProblem(null);
    setDone(false);
    const typed = new FormData(submitEvent.currentTarget).get("alt");
    const alt = typeof typed === "string" ? typed : "";
    const fileMessage = file ? await checkImageFile(file) : "Escolha a imagem do evento.";
    const altMessage = validateImageAlt(alt);
    setFileError(fileMessage);
    setAltError(altMessage);
    if (fileMessage !== undefined || altMessage !== undefined || file === null) {
      document.getElementById(fileMessage !== undefined ? fileId : altId)?.focus();
      return;
    }

    setUploading(true);
    try {
      onUpdated(await uploadEventImage(event.id, file, alt.trim()));
      setFile(null);
      showPreview(null);
      if (fileInput.current) fileInput.current.value = "";
      setDone(true);
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {event.image ? (
        <figure className="flex flex-col gap-2">
          <div className="aspect-banner overflow-hidden rounded-lg">
            <EventImage image={event.image} sizes="(min-width: 768px) 720px, 100vw" />
          </div>
          <figcaption className="text-body-sm text-ink-muted">
            Descrição: {event.image.alt || "nenhuma"}
          </figcaption>
        </figure>
      ) : (
        <p className="text-body text-ink-muted">
          Nenhuma imagem ainda. Prefira uma foto horizontal, com o assunto no centro.
        </p>
      )}

      {done ? <Alert variant="success" title="Imagem atualizada." /> : null}
      {problem ? <Alert variant="danger" title={problem} /> : null}

      {readOnly ? null : (
        <form
          method="post"
          noValidate
          aria-label="Enviar imagem"
          onSubmit={(submitEvent) => void handleSubmit(submitEvent)}
          className="flex flex-col gap-6"
        >
          <Field
            id={fileId}
            label={event.image ? "Trocar a imagem" : "Arquivo da imagem"}
            hint="JPEG, PNG ou WebP de até 5 MB, com ao menos 1200 × 600 pixels."
            error={fileError}
          >
            {(control) => (
              <input
                ref={fileInput}
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(changeEvent) => {
                  void choose(changeEvent.currentTarget.files?.[0] ?? null);
                }}
                className="block w-full cursor-pointer text-body-sm text-ink-muted file:mr-4 file:h-11 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-surface file:px-4 file:text-label file:text-ink hover:file:bg-surface-sunken"
                {...control}
              />
            )}
          </Field>
          {preview && fileError === undefined ? (
            <div className="aspect-banner overflow-hidden rounded-lg bg-surface-sunken">
              {/* The chosen file, before it is sent: a local blob, not an optimized image. */}
              <img
                src={preview}
                alt="Prévia da imagem escolhida"
                className="size-full object-cover"
              />
            </div>
          ) : null}
          <Input
            id={altId}
            name="alt"
            label="Descrição da imagem"
            hint="O que a foto mostra, para quem usa leitor de tela. Ex.: Pista cheia sob a lona do Circo Voador."
            defaultValue={event.image?.alt}
            maxLength={EVENT_IMAGE_ALT_MAX_LENGTH}
            error={altError}
            onChange={() => {
              setAltError(undefined);
            }}
            fieldSize="md"
          />
          <Button
            type="submit"
            variant="secondary"
            loading={uploading}
            loadingLabel="Enviando…"
            className="w-full sm:w-auto sm:self-start"
          >
            Enviar imagem
          </Button>
        </form>
      )}
    </div>
  );
}
