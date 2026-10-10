"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

import { cn } from "../lib/cn";

interface TooltipProps {
  /** The trigger. It must accept a ref and props (a button or a link). */
  children: ReactElement;
  content: ReactNode;
  className?: string;
}

/**
 * A short name for a control that has no visible text (docs/DESIGN.md, 3.1). It opens on
 * hover and on keyboard focus, closes with Esc and never holds anything essential: the
 * trigger keeps its own accessible name.
 */
export function Tooltip({ children, content, className }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className={cn(
              "z-dropdown rounded-sm bg-ink px-2 py-1 text-body-sm text-surface data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
