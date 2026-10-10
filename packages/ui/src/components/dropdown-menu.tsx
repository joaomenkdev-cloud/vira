"use client";

import { Check, type LucideIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../lib/cn";
import { Icon } from "./icon";
import { menuContentStyles, menuItemStyles } from "./menu-styles";

/** The menu and its trigger come straight from Radix. The trigger is usually a Button. */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export interface DropdownMenuContentProps extends Omit<
  ComponentProps<typeof DropdownMenuPrimitive.Content>,
  "className" | "asChild"
> {
  className?: string;
}

/**
 * The floating panel (docs/DESIGN.md, 3.6): arrow keys, Home/End, type-ahead and Esc
 * work, and the focus returns to the trigger on close. It is at least as wide as the
 * trigger.
 */
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  align = "start",
  ...rest
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(menuContentStyles(), "max-h-menu-available", className)}
        {...rest}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export interface DropdownMenuItemProps extends Omit<
  ComponentProps<typeof DropdownMenuPrimitive.Item>,
  "className" | "asChild"
> {
  icon?: LucideIcon;
  /** Delete, cancel an order... Red, and set apart from the others by a separator. */
  destructive?: boolean;
  className?: string;
}

export function DropdownMenuItem({
  icon,
  destructive = false,
  className,
  children,
  ...rest
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(menuItemStyles({ destructive }), "justify-start", className)}
      {...rest}
    >
      {icon ? <Icon icon={icon} size={16} /> : null}
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export interface DropdownMenuRadioItemProps extends Omit<
  ComponentProps<typeof DropdownMenuPrimitive.RadioItem>,
  "className" | "asChild"
> {
  className?: string;
}

/** A choice in a `DropdownMenuRadioGroup`: the chosen one is medium weight with a check. */
export function DropdownMenuRadioItem({
  className,
  children,
  ...rest
}: DropdownMenuRadioItemProps) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(menuItemStyles(), className)} {...rest}>
      {children}
      <DropdownMenuPrimitive.ItemIndicator>
        <Icon icon={Check} size={16} />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} />;
}

export function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-3 py-2 text-overline text-ink-muted uppercase", className)}
    >
      {children}
    </DropdownMenuPrimitive.Label>
  );
}
