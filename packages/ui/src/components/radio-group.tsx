"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useId, type ReactNode, type Ref } from "react";

import { cn } from "../lib/cn";
import { FieldError } from "./field";

export interface RadioGroupProps {
  /** The question the options answer. It names the group for assistive technology. */
  legend: ReactNode;
  /** One or more `<Radio>`. */
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** The error message. Sets `aria-invalid` and describes the group. */
  error?: ReactNode;
  hint?: ReactNode;
  id?: string;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * A group of mutually exclusive options (docs/DESIGN.md, 3.2) on the Radix RadioGroup:
 * one tab stop, arrow keys move and select.
 */
export function RadioGroup({
  legend,
  children,
  error,
  hint,
  id,
  className,
  ref,
  required = true,
  ...rest
}: RadioGroupProps) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const legendId = `${groupId}-legend`;
  const hintId = `${groupId}-hint`;
  const errorId = `${groupId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span id={legendId} className="text-label text-ink">
        {legend}
      </span>
      <RadioGroupPrimitive.Root
        ref={ref}
        id={groupId}
        aria-labelledby={legendId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        required={required}
        {...rest}
      >
        {children}
      </RadioGroupPrimitive.Root>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hint && !error ? (
        <p id={hintId} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface RadioProps {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** A 20 px radio in a 44 px row; selected, it shows a dot in `ink`. */
export function Radio({ label, description, id, className, ref, ...rest }: RadioProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;

  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-2", className)}>
      <RadioGroupPrimitive.Item
        ref={ref}
        id={controlId}
        aria-describedby={description ? descriptionId : undefined}
        className="mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface transition-colors duration-fast enabled:hover:border-ink-muted disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken data-[state=checked]:border-ink data-[state=checked]:enabled:hover:border-ink"
        {...rest}
      >
        <RadioGroupPrimitive.Indicator className="size-2.5 rounded-full bg-ink" />
      </RadioGroupPrimitive.Item>
      <div className="flex flex-col">
        <label htmlFor={controlId} className="cursor-pointer text-body text-ink">
          {label}
        </label>
        {description ? (
          <span id={descriptionId} className="text-body-sm text-ink-muted">
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}
