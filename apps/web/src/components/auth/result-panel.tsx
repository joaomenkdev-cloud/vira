"use client";

import { Alert, type AlertVariant } from "@vira/ui";
import { useEffect, useRef, type ReactNode } from "react";

export interface ResultPanelProps {
  variant: AlertVariant;
  title: string;
  children?: ReactNode;
  /** One or two links to go on from here. */
  actions?: ReactNode;
}

/**
 * What a form turns into once it is done (or once a link turns out to be expired). The
 * focus moves to it, so a keyboard or screen reader user is not left on a form that is
 * gone.
 */
export function ResultPanel({ variant, title, children, actions }: ResultPanelProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className="flex flex-col gap-6 rounded-md focus:outline-none">
      <Alert variant={variant} title={title}>
        {children}
      </Alert>
      {actions ? <div className="flex flex-col gap-3 sm:flex-row">{actions}</div> : null}
    </div>
  );
}
