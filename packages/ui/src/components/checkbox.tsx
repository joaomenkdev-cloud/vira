"use client";

import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { useId, type ReactNode, type Ref } from "react";

import { cn } from "../lib/cn";
import { FieldError } from "./field";
import { Icon } from "./icon";

export interface CheckboxProps {
  label: ReactNode;
  description?: ReactNode;
  /** The error message. Sets `aria-invalid`. */
  error?: ReactNode;
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean | "indeterminate") => void;
  name?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * A 20 px checkbox in a 44 px row (docs/DESIGN.md, 3.2). The whole row, label included,
 * toggles it. It is checked in `ink`, so the state does not depend on the accent colour.
 */
export function Checkbox({
  label,
  description,
  error,
  id,
  className,
  ref,
  ...rest
}: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = error ? errorId : description ? descriptionId : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex min-h-11 items-start gap-3 py-2">
        <CheckboxPrimitive.Root
          ref={ref}
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "group mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm border bg-surface text-surface transition-colors duration-fast disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=indeterminate]:border-ink data-[state=indeterminate]:bg-ink",
            error
              ? "border-danger"
              : "border-line-strong enabled:hover:border-ink-muted data-[state=checked]:enabled:hover:border-ink",
          )}
          {...rest}
        >
          <CheckboxPrimitive.Indicator>
            <CheckIndicator />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
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
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/** The mark of a `checked` box is a tick and of a mixed one a dash. */
function CheckIndicator() {
  return (
    <>
      <Icon icon={Check} size={16} className="group-data-[state=indeterminate]:hidden" />
      <Icon icon={Minus} size={16} className="hidden group-data-[state=indeterminate]:block" />
    </>
  );
}
