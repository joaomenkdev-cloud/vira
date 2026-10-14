import Link from "next/link";

/** For accounts that only sign in through Google or GitHub (`hasPassword: false`). */
export function NoPasswordNotice({ action }: { action: string }) {
  return (
    <p className="text-body text-ink-muted">
      Sua conta entra pelo login social e ainda não tem senha. Para {action}, crie uma senha
      primeiro em{" "}
      <Link href="/esqueci-a-senha" className="text-ink underline underline-offset-4">
        Esqueci minha senha
      </Link>
      : enviamos um link para o seu e-mail.
    </p>
  );
}
