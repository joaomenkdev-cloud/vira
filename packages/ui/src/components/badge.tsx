import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";

/*
 * Badges (docs/DESIGN.md, 3.4): 24 px tall, one short label. At most one status badge
 * per card; the "Demonstração" badge is mandatory on seeded events and does not count.
 * The text always names the state: colour is never the only carrier.
 */
const badgeStyles = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 px-2 text-overline tracking-normal whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "rounded-sm bg-surface-sunken text-ink",
        accent: "rounded-sm bg-accent-soft text-accent-ink",
        success: "rounded-sm bg-success-bg text-success",
        warning: "rounded-sm bg-warning-bg text-warning",
        danger: "rounded-sm bg-danger-bg text-danger",
        // Sits on a photograph: a solid surface, so the text never depends on the image.
        "on-image": "rounded-full bg-surface text-ink",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export type BadgeVariant = NonNullable<VariantProps<typeof badgeStyles>["variant"]>;

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ variant, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ variant }), className)} {...rest}>
      {children}
    </span>
  );
}
