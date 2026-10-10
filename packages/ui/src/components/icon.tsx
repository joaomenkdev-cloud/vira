import type { LucideIcon, LucideProps } from "lucide-react";

import { cn } from "../lib/cn";

/** Lucide stroke width, set once (docs/DESIGN.md, 2.8). */
export const ICON_STROKE_WIDTH = 1.75;

const SIZE_CLASSES = { 16: "size-4", 20: "size-5", 24: "size-6" } as const;

export type IconSize = keyof typeof SIZE_CLASSES;

export interface IconProps extends Omit<LucideProps, "size" | "strokeWidth" | "ref"> {
  icon: LucideIcon;
  /** The three sizes of the design system, in pixels. */
  size?: IconSize;
}

/**
 * A decorative Lucide icon. Icons only repeat what a nearby text or an aria-label
 * already says, so they are always hidden from assistive technology.
 */
export function Icon({ icon: Glyph, size = 20, className, ...props }: IconProps) {
  return (
    <Glyph
      aria-hidden="true"
      focusable="false"
      strokeWidth={ICON_STROKE_WIDTH}
      className={cn("shrink-0", SIZE_CLASSES[size], className)}
      {...props}
    />
  );
}
