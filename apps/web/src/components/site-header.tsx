import Link from "next/link";
import { Header, HeaderActions, HeaderLogo } from "@vira/ui";

import { AccountMenu } from "./account-menu";
import { SiteNav } from "./site-nav";

/**
 * The logo, the way to explore events and, on the right, "Entrar" or the account menu.
 * "Meus ingressos" arrives with the page it leads to.
 */
export function SiteHeader() {
  return (
    <Header>
      <HeaderLogo asChild>
        <Link href="/" aria-label="Vira, página inicial" />
      </HeaderLogo>
      <SiteNav />
      <HeaderActions>
        <AccountMenu />
      </HeaderActions>
    </Header>
  );
}
