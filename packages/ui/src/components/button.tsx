"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";

import { cn } from "../lib/cn";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

/*
 * Buttons (docs/DESIGN.md, 3.1). The look (variant) and the box (size) are separate
 * `cva`s whose classes never overlap, because there is no tailwind-merge to settle a
 * conflict. `primary` is the one call to action per screen.
 */
export const lookStyles = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap transition duration-fast motion-safe:enabled:active:scale-98 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "rounded-md bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:bg-surface-sunken disabled:text-ink-subtle",
        secondary:
          "rounded-md border border-line-strong bg-surface text-ink hover:bg-surface-sunken disabled:bg-surface-sunken disabled:text-ink-subtle",
        ghost:
          "rounded-md bg-transparent text-ink hover:bg-surface-sunken active:bg-line disabled:bg-transparent disabled:text-ink-subtle",
        danger:
          "rounded-md border border-danger bg-surface text-danger hover:bg-danger-bg active:bg-danger-bg disabled:border-line disabled:bg-surface-sunken disabled:text-ink-subtle",
        link: "rounded-sm bg-transparent text-ink underline decoration-1 underline-offset-4 hover:text-accent-ink disabled:text-ink-subtle",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

const boxStyles = cva("gap-2", {
  variants: {
    size: {
      sm: "h-9 px-3 text-label",
      md: "h-11 px-4 text-body font-medium",
      lg: "h-13 px-5 text-body font-semibold",
    },
  },
  defaultVariants: { size: "md" },
});

const squareStyles = cva("", {
  variants: {
    size: {
      sm: "size-9",
      md: "size-11",
      lg: "size-13",
    },
  },
  defaultVariants: { size: "md" },
});

export type ButtonVariant = NonNullable<VariantProps<typeof lookStyles>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof boxStyles>["size"]>;

/** Icons are 16 px in the small button and 20 px in the others. */
const ICON_SIZE = { sm: 16, md: 20, lg: 20 } as const;

/** The link variant is text on the line: it has no box of its own. */
export function buttonClassName(
  variant: ButtonVariant,
  size: ButtonSize,
  className?: string,
): string {
  return cn(lookStyles({ variant }), variant !== "link" && boxStyles({ size }), className);
}

interface ButtonBaseProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "className"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

export interface ButtonProps extends ButtonBaseProps {
  children: ReactNode;
  /** Icon before the label. Replaced by the spinner while loading. */
  iconStart?: LucideIcon;
  /** Waits for a result: shows the spinner, ignores clicks and sets `aria-busy`. */
  loading?: boolean;
  /** The label while loading, in the gerund ("Processando…"). Defaults to the normal label. */
  loadingLabel?: string;
  asChild?: false;
}

export interface LinkButtonProps extends Omit<
  ButtonBaseProps,
  "ref" | "type" | "disabled" | "onClick"
> {
  /** Gives the look of a button to the single child element (an `<a>` or the framework `Link`). */
  asChild: true;
  children: ReactNode;
}

/**
 * While loading, the normal label and the loading one share a grid cell and the one
 * not in use is invisible: the width never changes, so nothing jumps (3.1).
 */
export function Button(props: ButtonProps | LinkButtonProps) {
  if (props.asChild === true) {
    const { asChild: _asChild, variant = "primary", size = "md", className, ...rest } = props;
    return <Slot.Root className={buttonClassName(variant, size, className)} {...rest} />;
  }

  const {
    asChild: _asChild,
    variant = "primary",
    size = "md",
    className,
    children,
    iconStart,
    loading = false,
    loadingLabel,
    type = "button",
    onClick,
    ref,
    ...rest
  } = props;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      onClick={handleClick}
      className={buttonClassName(variant, size, className)}
      {...rest}
    >
      <span className="grid items-center justify-items-center">
        <span
          aria-hidden={loading || undefined}
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center gap-2",
            loading && "invisible",
          )}
        >
          {iconStart ? <Icon icon={iconStart} size={ICON_SIZE[size]} /> : null}
          {children}
        </span>
        <span
          aria-hidden={!loading || undefined}
          className={cn(
            "col-start-1 row-start-1 inline-flex items-center gap-2",
            !loading && "invisible",
          )}
        >
          <Spinner decorative size={16} />
          {loadingLabel ?? children}
        </span>
      </span>
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonBaseProps, "variant" | "children"> {
  icon: LucideIcon;
  /** What the button does: its only accessible name, and the tooltip text. */
  label: string;
  variant?: Exclude<ButtonVariant, "link">;
}

/** A square, icon-only button (36, 44 or 52 px) with a tooltip on hover and focus. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  type = "button",
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip content={label}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(lookStyles({ variant }), squareStyles({ size }), className)}
        {...rest}
      >
        <Icon icon={icon} size={ICON_SIZE[size]} />
      </button>
    </Tooltip>
  );
}
