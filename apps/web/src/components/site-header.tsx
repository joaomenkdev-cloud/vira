import Link from "next/link";
import { Header, HeaderLogo } from "@vira/ui";

import { SiteNav } from "./site-nav";

/**
 * The logo and the way to explore events. "Meus ingressos" and sign-in arrive with the
 * pages they lead to; the design system already has the slots for them (HeaderNav,
 * HeaderActions).
 */
export function SiteHeader() {
  return (
    <Header>
      <HeaderLogo asChild>
        <Link href="/" aria-label="Vira, página inicial" />
      </HeaderLogo>
      <SiteNav />
    </Header>
  );
}
