"use client";

import { Check, Minus } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";

import { cn } from "../lib/cn";
import { mergeRefs } from "../lib/merge-refs";
import { FieldError } from "./field";
import { Icon } from "./icon";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "id" | "className" | "children" | "aria-invalid" | "aria-describedby"
> {
  label: ReactNode;
  description?: ReactNode;
  /** The error message. Sets `aria-invalid` and describes the box. */
  error?: ReactNode;
  /** A mixed state ("select all" with some selected). The DOM only knows it as a property. */
  indeterminate?: boolean;
  id?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * A 20 px checkbox in a 44 px row (docs/DESIGN.md, 3.2), checked in `ink`.
 *
 * It is a native `<input type="checkbox">` drawn with CSS, not a Radix checkbox: the
 * native control already has the keyboard, form and screen-reader behaviour, works before
 * the page hydrates, and, unlike Radix, puts no inline `style` in the server HTML, which
 * the strict Content Security Policy would block.
 */
export function Checkbox({
  label,
  description,
  error,
  indeterminate = false,
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

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex min-h-11 items-start gap-3 py-2">
        <span className="relative mt-0.5 inline-flex size-5 shrink-0">
          <input
            ref={mergeRefs(inputRef, ref)}
            type="checkbox"
            id={controlId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "peer size-5 cursor-pointer appearance-none rounded-sm border bg-surface transition-colors duration-fast checked:border-ink checked:bg-ink indeterminate:border-ink indeterminate:bg-ink disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:checked:border-ink-subtle disabled:checked:bg-ink-subtle disabled:indeterminate:border-ink-subtle disabled:indeterminate:bg-ink-subtle",
              error
                ? "border-danger"
                : "border-line-strong enabled:not-checked:not-indeterminate:hover:border-ink-muted",
            )}
            {...rest}
          />
          <Icon
            icon={Check}
            size={16}
            className="pointer-events-none absolute inset-0 m-auto hidden text-surface peer-checked:block peer-indeterminate:hidden"
          />
          <Icon
            icon={Minus}
            size={16}
            className="pointer-events-none absolute inset-0 m-auto hidden text-surface peer-indeterminate:block"
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
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
