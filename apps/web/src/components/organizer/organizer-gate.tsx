"use client";

import type { Account } from "@vira/shared";
import { Alert, Button, EmptyState } from "@vira/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/lib/session/session-provider";

export interface OrganizerGateProps {
  /** Drawn while the page asks the API who is signed in: the shape of the page. */
  skeleton: ReactNode;
  children: (account: Account) => ReactNode;
}

/**
 * The door of every panel page: a visitor goes to the login (and comes back), an
 * account without an organizer profile is told where to create one, and only then the
 * page is drawn. The API checks all of this again on every call.
 */
export function OrganizerGate({ skeleton, children }: OrganizerGateProps) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { state } = session;

  useEffect(() => {
    if (state.status === "anonymous") {
      router.replace(`/entrar?next=${encodeURIComponent(pathname)}`);
    }
  }, [state.status, router, pathname]);

  if (state.status === "loading" || state.status === "anonymous") return skeleton;

  if (state.status === "unavailable") {
    return (
      <div className="mt-10 flex flex-col gap-6">
        <Alert variant="danger" title="Não foi possível carregar seus eventos.">
          Confira sua conexão e tente de novo.
        </Alert>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            void session.reload();
          }}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!state.account.organizer) {
    return (
      <EmptyState
        headingLevel={2}
        title="Crie seu perfil de organizador"
        action={
          <Button asChild variant="secondary">
            <Link href="/conta#organizador">Ir para minha conta</Link>
          </Button>
        }
      >
        Para criar e publicar eventos, escolha na sua conta o nome que o público vai ver.
      </EmptyState>
    );
  }

  return children(state.account);
}
