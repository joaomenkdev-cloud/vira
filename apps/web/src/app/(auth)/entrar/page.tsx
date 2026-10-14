import { OAUTH_LOGIN_ERRORS, type OAuthLoginError } from "@vira/shared";
import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { enabledOAuthProviders } from "@/config/oauth-providers";
import { returnPathFrom } from "@/lib/safe-path";
import { single, type SearchParams } from "@/lib/search-params";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

function oauthErrorFrom(value: string | undefined): OAuthLoginError | undefined {
  return OAUTH_LOGIN_ERRORS.find((code) => code === value);
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  return (
    <AuthShell title="Entrar" description="Acesse seus ingressos e sua conta.">
      <LoginForm
        next={returnPathFrom(single(params["next"]))}
        oauthError={oauthErrorFrom(single(params["erro"]))}
        providers={enabledOAuthProviders(process.env)}
      />
    </AuthShell>
  );
}
