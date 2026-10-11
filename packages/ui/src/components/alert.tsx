import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../lib/cn";
import { Icon } from "./icon";

/*
 * Alert (docs/DESIGN.md, 3.7): an inline, persistent message. The state is carried by
 * an icon and the text, never by colour alone, and there is no coloured side border.
 */
const alertStyles = cva("flex gap-3 rounded-md p-4", {
  variants: {
    variant: {
      success: "bg-success-bg text-success",
      warning: "bg-warning-bg text-warning",
      danger: "bg-danger-bg text-danger",
      info: "bg-info-bg text-info",
    },
  },
  defaultVariants: { variant: "info" },
});

export type AlertVariant = NonNullable<VariantProps<typeof alertStyles>["variant"]>;

const ICONS: Record<AlertVariant, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  info: Info,
};

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "role"> {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
}

/**
 * Errors are announced at once (`role="alert"`); everything else politely
 * (`role="status"`), so a confirmation never interrupts what a screen reader is saying.
 */
export function Alert({ variant = "info", title, children, className, ...rest }: AlertProps) {
  return (
    <div
      role={variant === "danger" ? "alert" : "status"}
      className={cn(alertStyles({ variant }), className)}
      {...rest}
    >
      <Icon icon={ICONS[variant]} className="mt-0.5" />
      <div className="flex flex-col gap-1">
        {title ? <p className="text-body font-semibold">{title}</p> : null}
        {children ? <div className="text-body-sm">{children}</div> : null}
      </div>
    </div>
  );
}
