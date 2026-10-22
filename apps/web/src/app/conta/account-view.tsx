"use client";

import { Alert, Button, Skeleton } from "@vira/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/lib/session/session-provider";

import { EmailSection } from "./email-section";
import { OrganizerSection } from "./organizer-section";
import { PasswordSection } from "./password-section";
import { PrivacySection } from "./privacy-section";
import { ProfileSection } from "./profile-section";
import { SessionsSection } from "./sessions-section";

export function AccountView() {
  const session = useSession();
  const router = useRouter();
  const { state } = session;

  useEffect(() => {
    if (state.status === "anonymous") router.replace("/entrar?next=/conta");
  }, [state.status, router]);

  if (state.status === "loading" || state.status === "anonymous") {
    return (
      <div aria-busy="true" className="mt-10 flex flex-col gap-10">
        <p role="status" className="sr-only">
          Carregando sua conta…
        </p>
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="mt-10 flex flex-col gap-6">
        <Alert variant="danger" title="Não foi possível carregar sua conta.">
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

  const { account } = state;
  return (
    <div className="mt-10 flex flex-col divide-y divide-line">
      <ProfileSection account={account} />
      <EmailSection account={account} />
      <PasswordSection account={account} />
      <OrganizerSection account={account} />
      <SessionsSection />
      <PrivacySection account={account} />
    </div>
  );
}
