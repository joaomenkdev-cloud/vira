import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  children: ReactNode;
  /** At most one action, as docs/DESIGN.md prescribes. */
  action?: ReactNode;
}

/**
 * Title, one sentence and at most one action. The perforated line is the only
 * graphic element: it echoes the ticket and is purely decorative.
 */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <section aria-labelledby="empty-state-title" className="mx-auto max-w-[420px] text-center">
      <div aria-hidden="true" className="mx-auto mb-6 w-24 border-t-2 border-dashed border-line" />
      <h2 id="empty-state-title" className="text-h3 text-ink">
        {title}
      </h2>
      <p className="mt-2 text-body text-ink-muted">{children}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
