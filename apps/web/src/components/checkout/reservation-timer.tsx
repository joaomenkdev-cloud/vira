"use client";

import { useEffect, useRef, useState } from "react";
import { Button, cn } from "@vira/ui";

import {
  announcementFor,
  formatCountdown,
  secondsLeft,
  WARNING_SECONDS,
} from "@/lib/checkout/countdown";

export interface ReservationTimerProps {
  expiresAt: string;
  extensionAvailable: boolean;
  /** "Manter reserva": the single +10 min (WCAG 2.2.1). */
  onExtend: () => Promise<void>;
  onExpired: () => void;
}

/**
 * "Reservado por 09:41" (docs/DESIGN.md, 3.11). It ticks every second on screen, but a
 * screen reader hears it only at 5, 2 and 1 minutes and at the end. In the last two
 * minutes it turns to `warning` and offers to keep the reservation, once.
 */
export function ReservationTimer({
  expiresAt,
  extensionAvailable,
  onExtend,
  onExpired,
}: ReservationTimerProps) {
  const [seconds, setSeconds] = useState(() => secondsLeft(expiresAt, Date.now()));
  const [announcement, setAnnouncement] = useState("");
  const [extending, setExtending] = useState(false);
  const previous = useRef(seconds);
  const expiredRef = useRef(onExpired);

  useEffect(() => {
    expiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    previous.current = secondsLeft(expiresAt, Date.now());
    setSeconds(previous.current);
    if (previous.current === 0) {
      expiredRef.current();
      return undefined;
    }
    const timer = setInterval(() => {
      const current = secondsLeft(expiresAt, Date.now());
      const spoken = announcementFor(previous.current, current);
      if (spoken) setAnnouncement(spoken);
      previous.current = current;
      setSeconds(current);
      if (current === 0) {
        clearInterval(timer);
        expiredRef.current();
      }
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [expiresAt]);

  const warning = seconds <= WARNING_SECONDS;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p
        className={cn(
          "rounded-sm text-body-sm tabular-nums",
          warning ? "bg-warning-bg px-2 py-1 font-semibold text-warning" : "text-ink-muted",
        )}
      >
        Reservado por <time dateTime={`PT${String(seconds)}S`}>{formatCountdown(seconds)}</time>
      </p>
      {warning && extensionAvailable && seconds > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          loading={extending}
          loadingLabel="Mantendo…"
          onClick={() => {
            setExtending(true);
            void onExtend().finally(() => {
              setExtending(false);
            });
          }}
        >
          Manter reserva
        </Button>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
