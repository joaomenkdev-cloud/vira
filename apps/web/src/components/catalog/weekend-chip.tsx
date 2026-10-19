import { Check } from "lucide-react";
import Link from "next/link";

import { cn, Icon } from "@vira/ui";

/**
 * A filter chip (docs/DESIGN.md, 4.1): a link that turns a filter on or off. Only the
 * filters the data supports exist; categories and free events come later. When on, it
 * says so with a check mark too, not with colour alone.
 */
export function WeekendChip({ href, selected = false }: { href: string; selected?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-sm border px-3 text-label transition-colors duration-base",
        selected
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-line-strong bg-surface text-ink hover:bg-surface-sunken",
      )}
    >
      {selected ? <Icon icon={Check} size={16} /> : null}
      Este fim de semana
    </Link>
  );
}
