"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonClassName, HeaderNav, HeaderNavLink, Icon } from "@vira/ui";

/**
 * "Explorar" in the header (docs/DESIGN.md, 3.11), underlined on the explore page. On a
 * phone the navigation is hidden, so a "Buscar" link leads to the same page (with its
 * label, which also spares an icon-only control its tooltip).
 */
export function SiteNav() {
  const pathname = usePathname();
  const exploring = pathname === "/eventos";

  return (
    <>
      <HeaderNav>
        <HeaderNavLink asChild current={exploring}>
          <Link href="/eventos">Explorar</Link>
        </HeaderNavLink>
      </HeaderNav>
      <Link href="/eventos" className={buttonClassName("ghost", "md", "ml-auto md:hidden")}>
        <Icon icon={Search} />
        Buscar
      </Link>
    </>
  );
}
