"use client";

import type { Ref, TextareaHTMLAttributes } from "react";

import { cn } from "../lib/cn";
import { controlStyles, Field, type FieldProps } from "./field";

export interface TextareaProps
  extends
    Omit<
      TextareaHTMLAttributes<HTMLTextAreaElement>,
      "id" | "className" | "aria-invalid" | "aria-describedby" | "aria-required"
    >,
    Pick<FieldProps, "label" | "optional" | "hint" | "error" | "id"> {
  className?: string;
  ref?: Ref<HTMLTextAreaElement>;
}

/** A multi-line field (docs/DESIGN.md, 3.2). The control grows taller by dragging its corner. */
export function Textarea({
  label,
  optional,
  hint,
  error,
  id,
  className,
  rows = 5,
  ref,
  ...rest
}: TextareaProps) {
  return (
    <Field
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      id={id}
      className={className}
    >
      {(control) => (
        <textarea
          ref={ref}
          rows={rows}
          className={cn(controlStyles({ invalid: Boolean(error) }), "min-h-28 resize-y px-3 py-3")}
          {...control}
          {...rest}
        />
      )}
    </Field>
  );
}
