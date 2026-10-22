"use client";

import {
  BRAZILIAN_STATES,
  EVENT_DESCRIPTION_MAX_LENGTH,
  EVENT_TITLE_MAX_LENGTH,
  type BrazilianState,
  type CreateEventRequest,
  type OrganizerEvent,
} from "@vira/shared";
import { Alert, Button, Input, Select, Textarea } from "@vira/ui";
import { useState, type ReactNode, type SubmitEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import {
  validateDescription,
  validateEndsAt,
  validateStartsAt,
  validateTitle,
  validateVenueAddress,
  validateVenueCity,
  validateVenueName,
  validateVenueState,
} from "@/lib/organizer/validation";
import { DEFAULT_TIME_ZONE, timeZoneOptions } from "@/lib/organizer/time-zones";
import { isoToWallTime, wallTimeToIso } from "@/lib/organizer/wall-time";

const FIELDS = [
  "title",
  "startsAt",
  "endsAt",
  "venueName",
  "venueAddress",
  "venueCity",
  "venueState",
  "descriptionMd",
] as const;
type Field = (typeof FIELDS)[number];

/** Where the API's `errors[].path` lands in this form. */
const API_PATHS: Readonly<Record<string, Field>> = {
  title: "title",
  startsAt: "startsAt",
  endsAt: "endsAt",
  descriptionMd: "descriptionMd",
  venue: "venueName",
  "venue.name": "venueName",
  "venue.address": "venueAddress",
  "venue.city": "venueCity",
  "venue.state": "venueState",
};

const STATE_OPTIONS = BRAZILIAN_STATES.map((state) => ({ value: state, label: state }));

export interface EventDetailsFormProps {
  /** The event being edited; absent when creating one. */
  event?: OrganizerEvent;
  /** Sends the details; the API's answer replaces what the page shows. */
  onSubmit: (body: CreateEventRequest) => Promise<void>;
  submitLabel: string;
  submittingLabel: string;
  /** The form's single primary action is the creation; saving an edit is secondary. */
  primary?: boolean;
  /** A canceled or ended event can no longer change: the fields are shown read-only. */
  readOnly?: boolean;
  /** Under the fields, above the button (the saved description's preview). */
  children?: ReactNode;
}

/**
 * Title, dates, venue and description of an event (docs/API.md, N8). Dates are typed
 * on the clock of the event's time zone, whatever zone the browser is in. A draft may
 * leave the venue empty; publishing asks for it.
 */
export function EventDetailsForm({
  event,
  onSubmit,
  submitLabel,
  submittingLabel,
  primary = false,
  readOnly = false,
  children,
}: EventDetailsFormProps) {
  const form = useForm<Field>({
    title: validateTitle,
    startsAt: validateStartsAt,
    endsAt: validateEndsAt,
    venueName: validateVenueName,
    venueAddress: validateVenueAddress,
    venueCity: validateVenueCity,
    venueState: validateVenueState,
    descriptionMd: validateDescription,
  });
  const [timezone, setTimezone] = useState(event?.timezone ?? DEFAULT_TIME_ZONE);
  const [venueState, setVenueState] = useState<string>(event?.venue?.state ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<{ title: string; items: string[] } | null>(null);
  const [saved, setSaved] = useState(false);

  const wall = (iso: string | undefined) =>
    iso === undefined ? "" : isoToWallTime(iso, event?.timezone ?? DEFAULT_TIME_ZONE);

  async function handleSubmit(submitEvent: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(submitEvent);
    setProblem(null);
    setSaved(false);
    if (values === null) return;

    const startsAt = wallTimeToIso(values.startsAt, timezone);
    const endsAt = wallTimeToIso(values.endsAt, timezone);
    if (startsAt === null || endsAt === null) return;
    const hasVenue = values.venueName.trim() !== "";
    const body: CreateEventRequest = {
      title: values.title.trim(),
      descriptionMd: values.descriptionMd,
      startsAt,
      endsAt,
      timezone,
      ...(hasVenue
        ? {
            venue: {
              name: values.venueName.trim(),
              address: values.venueAddress.trim(),
              city: values.venueCity.trim(),
              state: values.venueState as BrazilianState,
            },
          }
        : {}),
    };

    setSubmitting(true);
    try {
      await onSubmit(body);
      setSaved(true);
    } catch (error) {
      setProblem(problemOf(error));
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
      method="post"
      noValidate
      aria-label="Detalhes do evento"
      onSubmit={(submitEvent) => void handleSubmit(submitEvent)}
      className="flex flex-col gap-10"
    >
      <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
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

      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <Input
          {...form.field("title")}
          label="Nome do evento"
          placeholder="Ex.: Noite de forró no Circo"
          defaultValue={event?.title}
          maxLength={EVENT_TITLE_MAX_LENGTH}
          fieldSize="md"
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Input
            {...form.field("startsAt")}
            type="datetime-local"
            label="Começa em"
            defaultValue={wall(event?.startsAt)}
            fieldSize="md"
          />
          <Input
            {...form.field("endsAt")}
            type="datetime-local"
            label="Termina em"
            defaultValue={wall(event?.endsAt)}
            fieldSize="md"
          />
        </div>
        <Select
          name="timezone"
          label="Fuso horário"
          hint="As datas acima estão no horário do lugar do evento."
          options={timeZoneOptions(event?.timezone)}
          value={timezone}
          onValueChange={setTimezone}
          disabled={readOnly}
          fieldSize="md"
        />
      </fieldset>

      <fieldset disabled={readOnly} className="flex flex-col gap-6">
        <legend className="mb-2 text-h3">Local</legend>
        {event === undefined || event.status === "DRAFT" ? (
          <p className="text-body-sm text-ink-muted">
            O rascunho pode ficar sem local; para publicar, preencha os quatro campos.
          </p>
        ) : null}
        <Input
          {...form.field("venueName")}
          label="Nome do local"
          placeholder="Ex.: Circo Voador"
          defaultValue={event?.venue?.name}
          maxLength={120}
          fieldSize="md"
        />
        <Input
          {...form.field("venueAddress")}
          label="Endereço"
          placeholder="Ex.: Rua dos Arcos, s/n – Lapa"
          defaultValue={event?.venue?.address}
          maxLength={200}
          autoComplete="off"
          fieldSize="md"
        />
        <div className="grid gap-6 sm:grid-cols-3">
          <Input
            {...form.field("venueCity")}
            label="Cidade"
            placeholder="Ex.: Rio de Janeiro"
            defaultValue={event?.venue?.city}
            maxLength={80}
            autoComplete="off"
            fieldSize="md"
            className="sm:col-span-2"
          />
          <Select
            id={form.idOf("venueState")}
            name="venueState"
            label="UF"
            placeholder="Escolha"
            options={STATE_OPTIONS}
            value={venueState}
            onValueChange={setVenueState}
            error={form.errors.venueState}
            disabled={readOnly}
            fieldSize="md"
          />
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <Textarea
          {...form.field("descriptionMd")}
          label="Sobre o evento"
          optional
          hint="Aceita markdown: **negrito**, *itálico*, listas e links. HTML vira texto."
          defaultValue={event?.descriptionMd}
          maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
          rows={8}
        />
        {children}
      </fieldset>

      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="submit"
            variant={primary ? "primary" : "secondary"}
            loading={submitting}
            loadingLabel={submittingLabel}
            className="w-full sm:w-auto"
          >
            {submitLabel}
          </Button>
          {saved && !primary ? (
            <p role="status" className="text-body-sm text-success">
              Alterações salvas.
            </p>
          ) : null}
        </div>
      )}
    </form>
  );
}

/** What went wrong, with the list of what publication still needs when that is the cause. */
function problemOf(error: unknown): { title: string; items: string[] } {
  if (error instanceof ApiError && error.code === "invalid-state-transition") {
    return {
      title: messageFor(error),
      items: error.fieldErrors.map(({ message }) => capitalize(message)),
    };
  }
  return { title: messageFor(error), items: [] };
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}
