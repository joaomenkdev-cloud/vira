import { Slot } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";
import { Badge } from "./badge";

export interface EventCardProps {
  /**
   * The link to the event page, empty: the title is drawn inside it (`<Link href="…" />`).
   * Its hit area covers the whole card, so the card is a single tab stop.
   */
  link: ReactElement;
  title: string;
  /** The date line, already formatted ("SÁB, 14 MAR · 21:00"), usually a `<time>`. */
  date: ReactNode;
  /** "Casa de Shows · São Paulo". */
  venue: string;
  /** "A partir de R$ 80,00", or nothing when no ticket is left: never "R$ 0,00". */
  price?: string | null;
  /** The photo, filling its box (`object-cover`). Without one, the typographic placeholder. */
  image?: ReactNode;
  /** At most one status badge over the photo ("Esgotado"). */
  status?: string | null;
  /** Seeded example event: the "Demonstração" badge (ADR-0010). */
  isDemo?: boolean;
  /** Heading level of the title; pick the one that follows the heading above. */
  headingLevel?: 2 | 3;
  className?: string;
}

/** Up to two initials of the event name, for the placeholder of a card without a photo. */
export function initialsOf(title: string): string {
  return title
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR"))
    .join("");
}

/**
 * Event card (docs/DESIGN.md, 3.3): the photo in 3:2, the date in the accent (the only
 * red of the card), the name in at most two lines, the place, the lowest price. The
 * whole card is one link; the focus ring is drawn around the card, not the title.
 */
export function EventCard({
  link,
  title,
  date,
  venue,
  price,
  image,
  status,
  isDemo = false,
  headingLevel = 3,
  className,
}: EventCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors duration-slow hover:border-line-strong has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent",
        className,
      )}
    >
      <div className="relative aspect-card overflow-hidden bg-surface-sunken">
        {image ? (
          <div className="size-full transition-transform duration-slow group-hover:scale-103 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
            {image}
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="flex size-full items-center justify-center text-h1 text-ink-muted"
          >
            {initialsOf(title)}
          </div>
        )}
        {status ? (
          <Badge variant="on-image" className="absolute top-3 left-3">
            {status}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4 lg:p-5">
        <p className="text-overline text-accent uppercase">{date}</p>
        <Heading className="mt-2 line-clamp-2 text-h3 text-balance text-ink">
          <Slot.Root className="after:absolute after:inset-0 focus-visible:outline-none">
            <Slot.Slottable>{link}</Slot.Slottable>
            {title}
          </Slot.Root>
        </Heading>
        <p className="mt-1 truncate text-body-sm text-ink-muted">{venue}</p>
        {price || isDemo ? (
          <div className="mt-auto flex flex-col items-start gap-2 pt-3">
            {price ? (
              <p className="text-body font-semibold text-ink tabular-nums">{price}</p>
            ) : null}
            {isDemo ? <Badge>Demonstração</Badge> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
