"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClassName, HeaderNav, HeaderNavLink, Icon } from "@vira/ui";

import { useSession } from "@/lib/session/session-provider";

/**
 * "Explorar" in the header (docs/DESIGN.md, 3.11), underlined on the explore page, and
 * "Meus ingressos" once someone is signed in. On a
 * phone the navigation is hidden, so a "Buscar" link leads to the same page (with its
 * label, which also spares an icon-only control its tooltip).
 */
export function SiteNav() {
  const pathname = usePathname();
  const exploring = pathname === "/eventos";
  const signedIn = useSession().state.status === "authenticated";

  return (
    <>
      <HeaderNav>
        <HeaderNavLink asChild current={exploring}>
          <Link href="/eventos">Explorar</Link>
        </HeaderNavLink>
        {signedIn ? (
          <HeaderNavLink asChild current={pathname.startsWith("/ingressos")}>
            <Link href="/ingressos">Meus ingressos</Link>
          </HeaderNavLink>
        ) : null}
      </HeaderNav>
      <Link href="/eventos" className={buttonClassName("ghost", "md", "ml-auto md:hidden")}>
        <Icon icon={Search} />
        Buscar
      </Link>
    </>
  );
}
