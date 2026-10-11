import { cva } from "class-variance-authority";
import { CircleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { Icon } from "./icon";

/** What a control needs to be tied to its label, hint and error message. */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

export interface FieldProps {
  label: ReactNode;
  /** Every field is required unless it says otherwise; optional ones are marked in the label. */
  optional?: boolean | undefined;
  /** Marks the control as required for assistive technology. Defaults to `!optional`. */
  required?: boolean | undefined;
  /** Keeps the label for screen readers but not on screen (a search box with its own icon). */
  labelHidden?: boolean | undefined;
  /** Help text under the control. Replaced by the error while there is one. */
  hint?: ReactNode;
  /** The error message. Sets `aria-invalid` and is read as the control's description. */
  error?: ReactNode;
  id?: string | undefined;
  className?: string | undefined;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * The anatomy of a form field (docs/DESIGN.md, 3.2): a visible label above, the control,
 * then the hint or the error. A render prop hands the control the ids and ARIA wiring.
 */
export function Field({
  label,
  optional,
  required = !optional,
  labelHidden = false,
  hint,
  error,
  id,
  className,
  children,
}: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const hasError = Boolean(error);
  const hasHint = Boolean(hint) && !hasError;

  const control: FieldControlProps = { id: controlId };
  if (hasError) control["aria-invalid"] = true;
  if (required) control["aria-required"] = true;
  if (hasError) control["aria-describedby"] = errorId;
  else if (hasHint) control["aria-describedby"] = hintId;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={controlId} className={cn("text-label text-ink", labelHidden && "sr-only")}>
        {label}
        {optional ? <span className="font-normal text-ink-muted"> (opcional)</span> : null}
      </label>
      {children(control)}
      {hasError ? <FieldError id={errorId}>{error}</FieldError> : null}
      {hasHint ? (
        <p id={hintId} className="text-body-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** The message under an invalid control: an icon and text, never colour alone. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1 text-body-sm text-danger">
      <Icon icon={CircleAlert} size={16} className="mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

/** Border, fill and states shared by every text-like control. The height comes from `fieldHeight`. */
export const controlStyles = cva(
  "w-full rounded-md border bg-surface text-body text-ink transition-colors duration-fast placeholder:text-ink-muted disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-ink-subtle disabled:placeholder:text-ink-subtle",
  {
    variants: {
      invalid: {
        true: "border-danger",
        false: "border-line-strong enabled:hover:border-ink-muted enabled:focus-visible:border-ink",
      },
    },
    defaultVariants: { invalid: false },
  },
);

/** 48 px for the checkout and mobile, 44 px for the organiser panel. */
export const fieldHeight = cva("px-3", {
  variants: {
    size: { md: "h-11", lg: "h-12" },
  },
  defaultVariants: { size: "lg" },
});

export type FieldSize = "md" | "lg";
