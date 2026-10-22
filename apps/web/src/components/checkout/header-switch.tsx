"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The checkout has a header of its own, without navigation (docs/DESIGN.md, 4.3): nothing
 * leads away from paying except the browser's own back button.
 */
export function HeaderSwitch({ site, checkout }: { site: ReactNode; checkout: ReactNode }) {
  const pathname = usePathname();
  return pathname.startsWith("/checkout/") ? checkout : site;
}
