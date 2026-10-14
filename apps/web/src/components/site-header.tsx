import Link from "next/link";
import { Header, HeaderActions, HeaderLogo } from "@vira/ui";

import { AccountMenu } from "./account-menu";

/**
 * The logo and, on the right, "Entrar" or the account menu. The navigation ("Explorar",
 * "Meus ingressos") arrives with the pages it leads to; the design system already has
 * the slot for it (HeaderNav).
 */
export function SiteHeader() {
  return (
    <Header>
      <HeaderLogo asChild>
        <Link href="/" aria-label="Vira, página inicial" />
      </HeaderLogo>
      <HeaderActions>
        <AccountMenu />
      </HeaderActions>
    </Header>
  );
}
