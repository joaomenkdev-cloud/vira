import { Check } from "lucide-react";
import { cn, Icon } from "@vira/ui";

const STEPS = ["Ingressos", "Seus dados", "Pagamento"] as const;

/**
 * "1 Ingressos · 2 Seus dados · 3 Pagamento" (docs/DESIGN.md, 3.11): the current step in
 * `ink` underlined in `accent`, the finished ones with a check.
 */
export function CheckoutSteps({ current }: { current: 1 | 2 }) {
  return (
    <nav aria-label="Etapas">
      <ol role="list" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {STEPS.map((label, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={label} className="flex items-center gap-3">
              {index > 0 ? <span aria-hidden="true" className="h-px w-6 bg-line-strong" /> : null}
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 text-overline uppercase",
                  // `ink-subtle` would fail the contrast of text (WCAG 1.4.3).
                  active
                    ? "text-ink underline decoration-accent decoration-2 underline-offset-8"
                    : "text-ink-muted",
                )}
              >
                {done ? <Icon icon={Check} size={16} /> : <span>{index + 1}</span>}
                {label}
                {done ? <span className="sr-only">(concluída)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
