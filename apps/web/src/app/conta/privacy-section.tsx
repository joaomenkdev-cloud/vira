"use client";

import { ACCOUNT_DELETION_CONFIRMATION, type Account } from "@vira/shared";
import {
  Alert,
  Button,
  Input,
  Modal,
  ModalClose,
  ModalContent,
  ModalTrigger,
  PasswordInput,
} from "@vira/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";

import { ErrorSummary } from "@/components/forms/error-summary";
import { useForm } from "@/components/forms/use-form";
import {
  validateCurrentPassword,
  validateDeletionConfirmation,
} from "@/components/forms/validation";
import { saveExport } from "@/lib/account/data-export";
import { deleteAccount, exportAccountData, logout } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { messageFor } from "@/lib/api/messages";
import { useSession } from "@/lib/session/session-provider";

import { AccountSection } from "./account-section";

export function PrivacySection({ account }: { account: Account }) {
  return (
    <AccountSection
      id="privacidade"
      title="Privacidade"
      description={
        <>
          Guardamos só o necessário para vender e conferir ingressos. Veja o que é guardado e por
          quanto tempo na{" "}
          <Link href="/privacidade" className="text-ink underline underline-offset-4">
            política de privacidade
          </Link>
          .
        </>
      }
    >
      <DownloadData />
      <DeleteAccount account={account} />
    </AccountSection>
  );
}

function DownloadData() {
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function download() {
    setDownloading(true);
    setResult(null);
    try {
      saveExport(await exportAccountData());
      setResult({ ok: true, message: "Pronto: o arquivo foi baixado." });
    } catch (error) {
      setResult({ ok: false, message: messageFor(error) });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h3">Baixar meus dados</h3>
      <p className="text-body text-ink-muted">
        Um arquivo JSON com sua conta, pedidos, ingressos e sessões ativas, para guardar ou levar
        para outro serviço. Até 3 por dia.
      </p>
      {result ? <Alert variant={result.ok ? "success" : "danger"} title={result.message} /> : null}
      <Button
        variant="secondary"
        loading={downloading}
        loadingLabel="Preparando o arquivo…"
        className="self-start"
        onClick={() => {
          void download();
        }}
      >
        Baixar meus dados
      </Button>
    </div>
  );
}

const FIELDS = ["password", "confirm"] as const;

type Blocker =
  { kind: "reauthenticate" } | { kind: "upcoming-events" } | { kind: "error"; message: string };

function DeleteAccount({ account }: { account: Account }) {
  const session = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  // An account of social login only has no password to type: its field is not shown.
  const form = useForm({
    password: account.hasPassword ? validateCurrentPassword : () => undefined,
    confirm: validateDeletionConfirmation,
  });

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const values = form.submit(event);
    setBlocker(null);
    if (values === null) return;
    setDeleting(true);
    try {
      await deleteAccount({
        confirm: ACCOUNT_DELETION_CONFIRMATION,
        ...(account.hasPassword ? { password: values.password } : {}),
      });
      // That page forgets the session: doing it here would send this one to the login.
      router.replace("/conta-excluida");
    } catch (error) {
      setDeleting(false);
      if (error instanceof ApiError && error.code === "incorrect-password") {
        form.setFieldError("password", "Senha incorreta.");
      } else if (error instanceof ApiError && error.code === "reauthentication-required") {
        setBlocker({ kind: "reauthenticate" });
      } else if (error instanceof ApiError && error.code === "organizer-has-upcoming-events") {
        setBlocker({ kind: "upcoming-events" });
      } else {
        setBlocker({ kind: "error", message: messageFor(error) });
      }
    }
  }

  async function signInAgain() {
    try {
      await logout();
    } catch {
      // Already signed out is just as good: the login comes next either way.
    }
    session.signedOut();
    router.push("/entrar?next=/conta");
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h3">Excluir minha conta</h3>
      <p className="text-body text-ink-muted">
        Seu nome e seu e-mail são apagados de tudo o que a Vira guarda. Não dá para desfazer.
      </p>
      <Modal
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setBlocker(null);
        }}
      >
        <ModalTrigger asChild>
          <Button variant="danger" className="self-start">
            Excluir minha conta
          </Button>
        </ModalTrigger>
        <ModalContent
          title="Excluir sua conta?"
          description="A exclusão é definitiva. Antes de confirmar, veja o que acontece:"
        >
          <form
            noValidate
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-6"
          >
            <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
              <li>Seu nome e seu e-mail saem da conta, dos pedidos e dos ingressos.</li>
              <li>
                Ingressos de eventos que ainda vão acontecer são cancelados e deixam de valer na
                entrada. O valor pago não é devolvido.
              </li>
              <li>Você sai da conta em todos os dispositivos.</li>
              <li>Os registros de pagamento continuam, sem dizer de quem eram, como a lei pede.</li>
            </ul>
            <ErrorSummary errors={form.errors} fields={FIELDS} idOf={form.idOf} />
            {blocker ? <DeletionBlocker blocker={blocker} onSignInAgain={signInAgain} /> : null}
            {account.hasPassword ? (
              <PasswordInput
                {...form.field("password")}
                label="Sua senha"
                autoComplete="current-password"
              />
            ) : (
              <Alert variant="info" title="Por segurança, confirme que é você.">
                Sua conta entra pelo Google ou pelo GitHub. A exclusão vale até 5 minutos depois de
                entrar: se faz mais tempo, entre de novo e volte aqui.
              </Alert>
            )}
            <Input
              {...form.field("confirm")}
              label={`Digite ${ACCOUNT_DELETION_CONFIRMATION} para confirmar`}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <ModalClose asChild>
                <Button variant="secondary">Manter minha conta</Button>
              </ModalClose>
              <Button type="submit" variant="danger" loading={deleting} loadingLabel="Excluindo…">
                Excluir conta
              </Button>
            </div>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
}

function DeletionBlocker({
  blocker,
  onSignInAgain,
}: {
  blocker: Blocker;
  onSignInAgain: () => Promise<void>;
}) {
  if (blocker.kind === "reauthenticate") {
    return (
      <Alert variant="warning" title="Entre de novo para confirmar que é você.">
        <p>Faz mais de 5 minutos que você entrou. Depois de entrar, volte aqui e exclua a conta.</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            void onSignInAgain();
          }}
        >
          Entrar de novo
        </Button>
      </Alert>
    );
  }
  if (blocker.kind === "upcoming-events") {
    return (
      <Alert variant="warning" title="Você tem eventos publicados que ainda vão acontecer.">
        <p>
          Quem comprou ingresso conta com você. Cancele esses eventos no{" "}
          <Link href="/painel" className="underline underline-offset-4">
            painel
          </Link>{" "}
          e depois exclua a conta.
        </p>
      </Alert>
    );
  }
  return <Alert variant="danger" title={blocker.message} />;
}
