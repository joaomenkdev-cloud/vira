import type { CheckinResponseBody } from "@vira/shared";
import { cn } from "@vira/ui";

import { lookOf } from "@/lib/checkin/result";

/**
 * The outcome of a read, across the whole width, big enough to read from arm's length.
 * The live region around it is the page's (it must exist before the result does).
 */
export function CheckinResult({
  outcome,
  timezone,
  className,
}: {
  outcome: CheckinResponseBody;
  timezone: string;
  className?: string;
}) {
  const look = lookOf(outcome, timezone);
  // Larger than the system's icon sizes: the result is read from arm's length.
  const Glyph = look.icon;
  return (
    <div className={cn("flex flex-col gap-4 rounded-lg p-6", look.className, className)}>
      <div className="flex items-center gap-3">
        <Glyph aria-hidden="true" className="size-10 shrink-0" />
        <p className="text-h1-sm md:text-h1">{look.title}</p>
      </div>
      <p className="text-body font-medium">{look.detail}</p>
      {outcome.ticket ? (
        <dl className="grid gap-3 text-ink sm:grid-cols-3">
          <div className="sm:col-span-3">
            <dt className="text-overline text-ink-muted uppercase">Titular</dt>
            <dd className="mt-1 text-h2-sm md:text-h2">{outcome.ticket.holderName}</dd>
          </div>
          <div>
            <dt className="text-overline text-ink-muted uppercase">Tipo</dt>
            <dd className="mt-1 text-body font-semibold">{outcome.ticket.ticketType}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-overline text-ink-muted uppercase">Código</dt>
            <dd className="mt-1 font-mono text-body tracking-widest tabular-nums">
              {outcome.ticket.code}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
