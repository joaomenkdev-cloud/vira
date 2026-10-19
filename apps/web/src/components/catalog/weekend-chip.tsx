import { FilterChip } from "../filter-chip";

/**
 * The weekend filter of the storefront (docs/DESIGN.md, 4.1). Only the filters the data
 * supports exist; categories and free events come later.
 */
export function WeekendChip({ href, selected = false }: { href: string; selected?: boolean }) {
  return (
    <FilterChip href={href} selected={selected}>
      Este fim de semana
    </FilterChip>
  );
}
