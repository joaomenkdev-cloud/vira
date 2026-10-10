"use client";

import { createContext, useContext, useId, type ReactNode, type Ref } from "react";

import { cn } from "../lib/cn";
import { useControllable } from "../lib/use-controllable";
import { FieldError } from "./field";

interface RadioGroupContext {
  name: string;
  value: string;
  disabled: boolean;
  invalid: boolean;
  select: (value: string) => void;
}

const GroupContext = createContext<RadioGroupContext | null>(null);

export interface RadioGroupProps {
  /** The question the options answer. It names the group for assistive technology. */
  legend: ReactNode;
  /** One or more `<Radio>`. */
  children: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Submits the choice with a form. A name is generated when none is given. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** The error message. Sets `aria-invalid` and describes the group. */
  error?: ReactNode;
  hint?: ReactNode;
  id?: string;
  className?: string;
  ref?: Ref<HTMLFieldSetElement>;
}

/**
 * A group of mutually exclusive options (docs/DESIGN.md, 3.2). It is a `<fieldset>` with
 * a `<legend>` holding native radio inputs that share a name, so the browser provides the
 * single tab stop and the arrow-key movement, and it works before hydration.
 */
export function RadioGroup({
  legend,
  children,
  value,
  defaultValue = "",
  onValueChange,
  name,
  disabled = false,
  required = true,
  error,
  hint,
  id,
  className,
  ref,
}: RadioGroupProps) {
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const hintId = `${groupId}-hint`;
  const errorId = `${groupId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  const [current, setCurrent] = useControllable(value, defaultValue, onValueChange);

  return (
    <fieldset
      ref={ref}
      id={groupId}
      role="radiogroup"
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      className={cn("m-0 flex min-w-0 flex-col gap-1 border-0 p-0", className)}
    >
      <legend className="mb-1 p-0 text-label text-ink">{legend}</legend>
      <GroupContext
        value={{
          name: name ?? `${groupId}-name`,
          value: current,
          disabled,
          invalid: Boolean(error),
          select: setCurrent,
        }}
      >
        {children}
      </GroupContext>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hint && !error ? (
        <p id={hintId} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface RadioProps {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/** A 20 px radio in a 44 px row; selected, it shows a dot in `ink`. */
export function Radio({
  value,
  label,
  description,
  disabled = false,
  id,
  className,
  ref,
}: RadioProps) {
  const group = useContext(GroupContext);
  if (!group) throw new Error("<Radio> must be used inside a <RadioGroup>.");

  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;

  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-2", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0">
        <input
          ref={ref}
          type="radio"
          id={controlId}
          name={group.name}
          value={value}
          checked={group.value === value}
          disabled={disabled || group.disabled}
          aria-describedby={description ? descriptionId : undefined}
          onChange={() => {
            group.select(value);
          }}
          className={cn(
            "peer size-5 cursor-pointer appearance-none rounded-full border bg-surface transition-colors duration-fast checked:border-ink disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:checked:border-ink-subtle",
            group.invalid
              ? "border-danger"
              : "border-line-strong enabled:not-checked:hover:border-ink-muted",
          )}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-auto hidden size-2.5 rounded-full bg-ink peer-checked:block peer-disabled:bg-ink-subtle"
        />
      </span>
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
