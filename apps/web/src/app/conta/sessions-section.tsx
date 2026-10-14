"use client";

import type { SessionSummary } from "@vira/shared";
import {
  Alert,
  Badge,
  Button,
  Modal,
  ModalClose,
  ModalContent,
  ModalTrigger,
  SkeletonText,
} from "@vira/ui";
import { useCallback, useEffect, useState } from "react";

import { listSessions, logoutAll, revokeSession } from "@/lib/api/auth";
import { messageFor } from "@/lib/api/messages";
import { useSession } from "@/lib/session/session-provider";

import { AccountSection } from "./account-section";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

/** "14 de outubro, 21:05". */
export function formatWhen(iso: string): string {
  return dateTime.format(new Date(iso)).replace(" às ", ", ");
}

type Load =
  | { status: "loading" }
  | { status: "ready"; sessions: readonly SessionSummary[] }
  | { status: "failed"; message: string };

async function loadSessions(): Promise<Load> {
  try {
    return { status: "ready", sessions: await listSessions() };
  } catch (error) {
    return { status: "failed", message: messageFor(error) };
  }
}

export function SessionsSection() {
  const session = useSession();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoad(await loadSessions());
  }, []);

  useEffect(() => {
    void loadSessions().then(setLoad);
  }, []);

  async function revoke(id: string) {
    setBusy(id);
    setProblem(null);
    try {
      await revokeSession(id);
      await fetchSessions();
    } catch (error) {
      setProblem(messageFor(error));
    } finally {
      setBusy(null);
    }
  }

  async function signOutEverywhere() {
    setBusy("all");
    setProblem(null);
    try {
      await logoutAll();
      // The account page sends a signed-out visitor to the login.
      session.signedOut();
    } catch (error) {
      setProblem(messageFor(error));
      setBusy(null);
    }
  }

  return (
    <AccountSection
      title="Sessões"
      description="Os dispositivos onde sua conta está aberta. Encerre os que você não reconhece."
    >
      {problem ? <Alert variant="danger" title={problem} /> : null}

      {load.status === "loading" ? (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            Carregando as sessões…
          </p>
          <SkeletonText lines={4} />
        </div>
      ) : load.status === "failed" ? (
        <Alert variant="danger" title={load.message} />
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
          {load.sessions.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 text-body text-ink">
                  Entrou em {formatWhen(item.authenticatedAt)}
                  {item.current ? <Badge variant="accent">Esta sessão</Badge> : null}
                </p>
                <p className="text-body-sm text-ink-muted">
                  Último uso em {formatWhen(item.lastRefreshedAt)}
                </p>
              </div>
              {item.current ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy === item.id}
                  loadingLabel="Encerrando…"
                  aria-label={`Encerrar a sessão de ${formatWhen(item.authenticatedAt)}`}
                  onClick={() => {
                    void revoke(item.id);
                  }}
                  className="self-start sm:self-auto"
                >
                  Encerrar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal>
        <ModalTrigger asChild>
          <Button variant="danger" className="self-start">
            Sair de todos os dispositivos
          </Button>
        </ModalTrigger>
        <ModalContent
          title="Sair de todos os dispositivos?"
          description="Todas as sessões da sua conta serão encerradas, inclusive esta. Você vai precisar entrar de novo."
          footer={
            <>
              <ModalClose asChild>
                <Button variant="secondary">Cancelar</Button>
              </ModalClose>
              <Button
                variant="danger"
                loading={busy === "all"}
                loadingLabel="Saindo…"
                onClick={() => {
                  void signOutEverywhere();
                }}
              >
                Sair de todos
              </Button>
            </>
          }
        />
      </Modal>
    </AccountSection>
  );
}
