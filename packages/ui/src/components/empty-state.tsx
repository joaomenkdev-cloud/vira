import { useId, type ReactNode } from "react";

import { cn } from "../lib/cn";

export interface EmptyStateProps {
  title: ReactNode;
  /** One sentence that says what will appear here, or what to do. */
  children: ReactNode;
  /** At most one action (docs/DESIGN.md, 3.9). */
  action?: ReactNode;
  /** Heading level of the title; pick the one that follows the heading above. */
  headingLevel?: 2 | 3;
  className?: string;
}

/**
 * An empty state (docs/DESIGN.md, 3.9): a title, one sentence and at most one action,
 * centred in 420 px. The perforated line is the only graphic element. It echoes the
 * ticket and is purely decorative.
 */
export function EmptyState({
  title,
  children,
  action,
  headingLevel = 3,
  className,
}: EmptyStateProps) {
  const titleId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <section
      aria-labelledby={titleId}
      className={cn("mx-auto max-w-empty-state py-16 text-center", className)}
    >
      <div aria-hidden="true" className="mx-auto mb-6 w-24 border-t-2 border-dashed border-line" />
      <Heading id={titleId} className="text-h3 text-ink">
        {title}
      </Heading>
      <p className="mt-2 text-body text-ink-muted">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
