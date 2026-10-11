"use client";

import { Minus, Plus } from "lucide-react";
import { cva } from "class-variance-authority";
import type { Ref } from "react";

import { cn } from "../lib/cn";
import { useControllable } from "../lib/use-controllable";
import { Icon } from "./icon";

const stepButtonStyles = cva(
  "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink transition duration-fast hover:bg-surface-sunken motion-safe:active:scale-98 aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-surface-sunken aria-disabled:text-ink-subtle disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-ink-subtle",
);

export interface QuantityStepperProps {
  /** What is being counted ("Pista – Lote 1"). Names the group for assistive technology. */
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Submits the value with a form. */
  name?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A quantity stepper (docs/DESIGN.md, 3.2): − value +. The value is announced politely
 * whenever it changes. At a limit the button is `aria-disabled` rather than `disabled`:
 * it looks and acts disabled, but keeps keyboard focus instead of dropping it to the page.
 */
export function QuantityStepper({
  label,
  value,
  defaultValue = 0,
  onValueChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  disabled = false,
  name,
  className,
  ref,
}: QuantityStepperProps) {
  const [current, setCurrent] = useControllable(value, defaultValue, onValueChange);
  const atMin = current <= min;
  const atMax = current >= max;

  function change(direction: 1 | -1) {
    const next = Math.min(max, Math.max(min, current + direction * step));
    if (next !== current) setCurrent(next);
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <button
        type="button"
        aria-label="Diminuir quantidade"
        aria-disabled={atMin || undefined}
        disabled={disabled}
        onClick={() => {
          change(-1);
        }}
        className={stepButtonStyles()}
      >
        <Icon icon={Minus} />
      </button>
      <output
        aria-live="polite"
        aria-atomic="true"
        className="min-w-10 text-center text-body font-semibold text-ink tabular-nums"
      >
        {current}
      </output>
      <button
        type="button"
        aria-label="Aumentar quantidade"
        aria-disabled={atMax || undefined}
        disabled={disabled}
        onClick={() => {
          change(1);
        }}
        className={stepButtonStyles()}
      >
        <Icon icon={Plus} />
      </button>
      {name ? <input type="hidden" name={name} value={current} /> : null}
    </div>
  );
}
