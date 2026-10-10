import { cva } from "class-variance-authority";

/*
 * The floating panel and its items are shared by the dropdown menu and the select
 * (docs/DESIGN.md, 3.6): a `surface` panel with the one shadow, 4 px of padding and
 * items 40 px tall (44 px for touch).
 */
export const menuContentStyles = cva(
  "z-dropdown min-w-menu-trigger overflow-hidden rounded-md border border-line bg-surface p-1 text-ink shadow-float data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in",
);

export const menuItemStyles = cva(
  "relative flex h-10 cursor-pointer items-center justify-between gap-3 rounded-sm px-3 text-body-sm select-none focus-visible:-outline-offset-2 pointer-coarse:h-11 data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-subtle data-[highlighted]:bg-surface-sunken data-[state=checked]:font-medium",
  {
    variants: {
      destructive: {
        true: "text-danger data-[highlighted]:bg-danger-bg",
        false: "",
      },
    },
    defaultVariants: { destructive: false },
  },
);
