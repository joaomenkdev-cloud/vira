import Link from "next/link";
import { Header, HeaderLogo } from "@vira/ui";

/**
 * The header carries only what exists today: the logo. Navigation ("Explorar",
 * "Meus ingressos") and sign-in arrive with the pages and features they lead to; the
 * design system already has the slots for them (HeaderNav, HeaderActions).
 */
export function SiteHeader() {
  return (
    <Header>
      <HeaderLogo asChild>
        <Link href="/" aria-label="Vira, página inicial" />
      </HeaderLogo>
    </Header>
  );
}
