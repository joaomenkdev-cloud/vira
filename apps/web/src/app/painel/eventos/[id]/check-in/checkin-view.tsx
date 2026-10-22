"use client";

import {
  type CheckinResponseBody,
  type CheckinStatsBody,
  normalizeTicketCode,
  type OrganizerEvent,
  TICKET_CODE_PATTERN,
} from "@vira/shared";
import { Alert, Badge, Button, EmptyState, Icon, Input, Skeleton } from "@vira/ui";
import { ChevronLeft, ScanLine } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type SubmitEvent } from "react";

import { CheckinResult } from "@/components/checkin/checkin-result";
import { QrScanner } from "@/components/checkin/qr-scanner";
import { OrganizerGate } from "@/components/organizer/organizer-gate";
import { checkTicketCode, getCheckinStats, scanTicket } from "@/lib/api/checkin";
import { lookOf, vibrationOf } from "@/lib/checkin/result";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { getOrganizerEvent } from "@/lib/api/organizer";
import { formatDateRange, formatTime } from "@/lib/format";
import { phaseOf } from "@/lib/organizer/event-state";

type Load =
  | { status: "loading" }
  | { status: "ready"; event: OrganizerEvent }
  | { status: "not-found" }
  | { status: "failed"; message: string };

/** What the door shows after the last read: its outcome, or why it could not be checked. */
type Shown =
  { kind: "outcome"; outcome: CheckinResponseBody } | { kind: "error"; message: string } | null;

async function fetchEvent(id: string): Promise<Load> {
  try {
    return { status: "ready", event: await getOrganizerEvent(id) };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return { status: "not-found" };
    }
    return { status: "failed", message: messageFor(error) };
  }
}

function BackLink({ id }: { id: string }) {
  return (
    <Link
      href={`/painel/eventos/${encodeURIComponent(id)}`}
      className="inline-flex min-h-11 items-center gap-1 text-label text-ink-muted hover:text-ink"
    >
      <Icon icon={ChevronLeft} size={16} />
      Voltar ao evento
    </Link>
  );
}

function DoorSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p role="status" className="sr-only">
        Carregando o check-in…
      </p>
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-11 w-3/4" />
      <Skeleton className="aspect-square w-full max-w-md rounded-lg" />
    </div>
  );
}

export function CheckinView({ id }: { id: string }) {
  return <OrganizerGate skeleton={<DoorSkeleton />}>{() => <Door id={id} />}</OrganizerGate>;
}

function Door({ id }: { id: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    void fetchEvent(id).then(setLoad);
  }, [id]);

  if (load.status === "loading") return <DoorSkeleton />;
  if (load.status === "not-found") {
    return (
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
    );
  }
  if (load.status === "failed") {
    return (
      <div className="flex flex-col gap-6">
        <BackLink id={id} />
        <Alert variant="danger" title="Não foi possível abrir o check-in.">
          {load.message}
        </Alert>
      </div>
    );
  }

  const { event } = load;
  const phase = phaseOf(event);
  if (phase === "DRAFT" || phase === "CANCELED") {
    return (
      <div className="flex flex-col gap-6">
        <BackLink id={id} />
        <h1 className="text-h1-sm md:text-h1">Check-in · {event.title}</h1>
        <Alert variant="info" title="O check-in abre para eventos publicados.">
          {phase === "DRAFT"
            ? "Publique o evento para vender ingressos e validá-los na entrada."
            : "Este evento foi cancelado; seus ingressos não dão mais acesso."}
        </Alert>
      </div>
    );
  }
  return <Reader event={event} ended={phase === "ENDED"} />;
}

function Reader({ event, ended }: { event: OrganizerEvent; ended: boolean }) {
  const [shown, setShown] = useState<Shown>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<CheckinStatsBody | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const busyRef = useRef(false);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getCheckinStats(event.id));
    } catch {
      // The count is a help, not the job: a failed refresh keeps the last one.
    }
  }, [event.id]);

  useEffect(() => {
    // The count is a help, not the job: when it fails, the door still works.
    getCheckinStats(event.id).then(setStats, () => undefined);
  }, [event.id]);

  const check = useCallback(
    async (read: () => Promise<CheckinResponseBody>) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        const outcome = await read();
        setShown({ kind: "outcome", outcome });
        // Not every browser vibrates (Safari on iPhone does not).
        if ("vibrate" in navigator) navigator.vibrate(vibrationOf(outcome));
        void refreshStats();
        return true;
      } catch (error) {
        setShown({ kind: "error", message: messageFor(error) });
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refreshStats],
  );

  const onScan = useCallback(
    (token: string) => {
      void check(() => scanTicket(event.id, token));
    },
    [check, event.id],
  );

  async function onSubmitCode(submit: SubmitEvent<HTMLFormElement>) {
    submit.preventDefault();
    const normalized = normalizeTicketCode(code);
    if (!TICKET_CODE_PATTERN.test(normalized)) {
      setCodeError("Digite os 8 caracteres do código, como VIRA-7KQ2-M9XD.");
      return;
    }
    setCodeError(undefined);
    if (await check(() => checkTicketCode(event.id, normalized))) setCode("");
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink id={event.id} />
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-overline text-accent uppercase">
          <Icon icon={ScanLine} size={16} />
          Check-in
          {event.isDemo ? <Badge>Demonstração</Badge> : null}
        </p>
        <h1 className="text-h1-sm text-balance md:text-h1">{event.title}</h1>
        <p className="text-body text-ink-muted">
          {formatDateRange(event.startsAt, event.endsAt, event.timezone)}
        </p>
      </header>
      {ended ? (
        <Alert variant="info" title="Este evento já terminou.">
          O check-in continua aberto para conferir os ingressos que ainda chegarem.
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-12">
        <section aria-label="Leitura do QR Code" className="lg:col-span-5">
          <QrScanner paused={shown !== null || busy} onRead={onScan} />
        </section>

        <div className="flex flex-col gap-8 lg:col-span-7">
          <section aria-labelledby="resultado" className="flex flex-col gap-4">
            <h2 id="resultado" className="sr-only">
              Resultado da leitura
            </h2>
            {/* Present before any result, so the first one is announced too. */}
            <div aria-live="assertive" aria-atomic="true">
              {shown?.kind === "outcome" ? (
                <CheckinResult outcome={shown.outcome} timezone={event.timezone} />
              ) : null}
              {shown?.kind === "error" ? (
                <Alert variant="danger" title="Não foi possível validar o ingresso.">
                  {shown.message}
                </Alert>
              ) : null}
              {shown === null ? (
                <p className="rounded-lg border border-dashed border-line-strong p-6 text-body text-ink-muted">
                  {busy ? "Validando…" : "Aguardando a leitura de um ingresso."}
                </p>
              ) : null}
            </div>
            {shown !== null ? (
              <Button
                size="lg"
                className="w-full sm:w-auto sm:self-start"
                onClick={() => {
                  setShown(null);
                }}
              >
                Ler próximo
              </Button>
            ) : null}
          </section>

          <form
            noValidate
            onSubmit={(submit) => {
              void onSubmitCode(submit);
            }}
            className="flex flex-col gap-3"
            aria-labelledby="pelo-codigo"
          >
            <h2 id="pelo-codigo" className="text-h3">
              Validar pelo código
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <Input
                label="Código do ingresso"
                hint="Impresso abaixo do QR Code, no formato VIRA-XXXX-XXXX."
                error={codeError}
                name="code"
                value={code}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="sm:flex-1"
                onChange={(change) => {
                  setCode(change.target.value);
                }}
              />
              <Button type="submit" variant="secondary" disabled={busy} className="sm:mt-8">
                Validar código
              </Button>
            </div>
          </form>

          <Count stats={stats} timezone={event.timezone} />
        </div>
      </div>
    </div>
  );
}

function Count({ stats, timezone }: { stats: CheckinStatsBody | null; timezone: string }) {
  if (!stats) return null;
  return (
    <section aria-labelledby="entradas" className="flex flex-col gap-4">
      <h2 id="entradas" className="text-h3">
        Entradas
      </h2>
      <p className="text-body">
        <span className="text-h2-sm font-semibold tabular-nums md:text-h2">{stats.checkedIn}</span>{" "}
        de <span className="tabular-nums">{stats.total}</span>{" "}
        {stats.total === 1 ? "ingresso entrou" : "ingressos entraram"}
      </p>
      {stats.lastScans.length > 0 ? (
        <div>
          <h3 className="text-label text-ink-muted">Últimas leituras</h3>
          <ul role="list" className="mt-2 flex flex-col divide-y divide-line">
            {stats.lastScans.map((scan, index) => {
              const look = lookOf(
                {
                  result: scan.result,
                  ...(scan.ticket ? { ticket: scan.ticket } : {}),
                },
                timezone,
              );
              return (
                <li
                  key={`${scan.at}-${String(index)}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-body-sm"
                >
                  <time dateTime={scan.at} className="text-ink-muted tabular-nums">
                    {formatTime(scan.at, timezone)}
                  </time>
                  <span className="font-semibold">
                    {scan.result === "ALREADY_USED" ? "Já utilizado" : look.title}
                  </span>
                  {scan.ticket ? <span>{scan.ticket.holderName}</span> : null}
                  <span className="text-ink-muted">
                    {scan.method === "QR" ? "QR Code" : "Código"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
